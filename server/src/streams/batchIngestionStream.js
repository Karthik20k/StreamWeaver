'use strict';

const { Writable } = require('node:stream');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const StagingData = require('../models/StagingData');
const DeadLetterQueue = require('../models/DeadLetterQueue');
const IngestionJob = require('../models/IngestionJob');
const dbEventBus = require('../events/dbEventBus');

// ---------------------------------------------------------------------------
// Write-concern optimised for maximum staging throughput.
// w:1     -> acknowledged by primary only (no replica wait)
// j:false -> do not wait for journal commit
// ---------------------------------------------------------------------------
const STAGING_WRITE_CONCERN = { w: 1, j: false };

// ---------------------------------------------------------------------------
// Transient MongoDB error codes that are safe to retry.
// ---------------------------------------------------------------------------
const TRANSIENT_ERROR_CODES = new Set([
  6, 7, 89, 91, 189, 9001, 10107, 11600, 11602, 13435, 13436
]);

function isTransientError(err) {
  if (!err) return false;
  if (err.name && (err.name.includes('MongoNetwork') || err.name === 'MongoServerSelectionError')) return true;
  if (err.code && TRANSIENT_ERROR_CODES.has(err.code)) return true;
  return false;
}

/**
 * Retry an async fn with exponential back-off.
 * Only retries on transient network-level errors.
 *
 * @param {function} fn
 * @param {object}   opts  { maxAttempts=5, baseDelayMs=150, maxDelayMs=8000, label }
 */
async function retryWithBackoff(fn, opts = {}) {
  const { maxAttempts = 5, baseDelayMs = 150, maxDelayMs = 8000, label = '[retryWithBackoff]' } = opts;
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err)) throw err;
      if (attempt < maxAttempts - 1) {
        const delay = Math.min(baseDelayMs * (2 ** attempt) + Math.random() * baseDelayMs, maxDelayMs);
        console.warn(`${label} Transient error attempt ${attempt + 1}/${maxAttempts}: ${err.message}. Retry in ${Math.round(delay)}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

/**
 * Collection-level schema validation checks on final target documents before insertion.
 * Validates documents against:
 *  1. TargetSchema definition (e.g. TargetSchema.validateRow)
 *  2. Custom validator functions
 *  3. Destination Mongoose collection model schema (e.g. Model.schema / validateSync)
 *
 * @param {Array<object>} documents - Final target documents ready for insertion
 * @param {object}        [Model] - Target Mongoose model
 * @param {object}        [targetSchema] - Optional TargetSchema model instance or definition
 * @param {function}      [customValidator] - Optional custom validator callback
 * @returns {{ valid: Array<object>, rejected: Array<{ doc: object, error: Error, failedField?: string, details?: object, stackTrace?: string }> }}
 */
function validateDocumentsAgainstSchema(documents, Model, targetSchema = null, customValidator = null) {
  const valid = [];
  const rejected = [];

  for (const doc of documents) {
    let rejection = null;

    // 1. TargetSchema validation (fields, constraints, types)
    if (targetSchema) {
      try {
        const payloadToValidate = (doc && doc.payload !== undefined) ? doc.payload : doc;
        if (typeof targetSchema.validateRow === 'function') {
          const valRes = targetSchema.validateRow(payloadToValidate);
          if (valRes && valRes.isValid === false) {
            const firstErr = (valRes.errorDetails && valRes.errorDetails[0]) || null;
            rejection = {
              doc,
              error: new Error(valRes.errors && valRes.errors[0] ? valRes.errors.join('; ') : 'Target schema validation failed'),
              errorType: 'SCHEMA_VALIDATION_FAILED',
              failedField: firstErr ? firstErr.field : null,
              details: {
                validationErrors: valRes.errors,
                errorDetails: valRes.errorDetails,
                source: 'TargetSchema.validateRow'
              },
              stackTrace: new Error().stack
            };
          }
        } else if (typeof targetSchema.validateSync === 'function') {
          const syncErr = targetSchema.validateSync();
          if (syncErr) {
            rejection = {
              doc,
              error: syncErr,
              errorType: 'SCHEMA_VALIDATION_FAILED',
              failedField: syncErr.errors ? Object.keys(syncErr.errors)[0] : null,
              details: { validationErrors: syncErr.errors },
              stackTrace: syncErr.stack
            };
          }
        }
      } catch (err) {
        rejection = {
          doc,
          error: err,
          errorType: 'SCHEMA_VALIDATION_FAILED',
          details: { message: err.message },
          stackTrace: err.stack
        };
      }
    }

    // 2. Custom validator callback
    if (!rejection && typeof customValidator === 'function') {
      try {
        const valRes = customValidator(doc);
        if (valRes && valRes.isValid === false) {
          rejection = {
            doc,
            error: new Error(valRes.error || valRes.message || 'Custom validation failed'),
            errorType: valRes.errorType || 'SCHEMA_VALIDATION_FAILED',
            failedField: valRes.failedField || null,
            details: valRes.details || null,
            stackTrace: valRes.stackTrace || new Error().stack
          };
        }
      } catch (err) {
        rejection = {
          doc,
          error: err,
          errorType: 'SCHEMA_VALIDATION_FAILED',
          details: { message: err.message },
          stackTrace: err.stack
        };
      }
    }

    // 3. Collection-level Mongoose model schema validation
    if (!rejection && Model && typeof Model === 'function' && Model.schema) {
      try {
        const inst = new Model(doc);
        const schemaErr = inst.validateSync();
        if (schemaErr) {
          rejection = {
            doc,
            error: schemaErr,
            errorType: 'SCHEMA_VALIDATION_FAILED',
            failedField: schemaErr.errors ? Object.keys(schemaErr.errors)[0] : null,
            details: {
              validationErrors: schemaErr.errors
                ? Object.fromEntries(Object.entries(schemaErr.errors).map(([k, v]) => [k, v.message || String(v)]))
                : { message: schemaErr.message },
              source: 'Model.validateSync'
            },
            stackTrace: schemaErr.stack
          };
        }
      } catch (err) {
        rejection = {
          doc,
          error: err,
          errorType: 'SCHEMA_VALIDATION_FAILED',
          details: { message: err.message },
          stackTrace: err.stack
        };
      }
    }

    if (rejection) {
      rejected.push(rejection);
    } else {
      valid.push(doc);
    }
  }

  return { valid, rejected };
}

// ---------------------------------------------------------------------------
// DestinationBuffer
// ---------------------------------------------------------------------------

/**
 * DestinationBuffer:
 * High-performance Writable Stream + micro-batching sink for clean records.
 *
 * Core Capabilities:
 *  - Micro-batch threshold: 5,000 records
 *  - Dual flush: size threshold OR 750ms inactivity timer
 *  - Collection-level schema validation checks on final target documents before insertion
 *  - Automatic routing of schema-rejected records to DeadLetterQueue (DLQ) with full error traces
 *  - Calculation of database-level performance indicators:
 *      * write duration per 5,000-record batch
 *      * cumulative documents committed
 *      * database I/O latency (MongoDB bulk write execution latency)
 *  - Database write metrics forwarding to internal event bus for client WebSocket broadcasting
 *  - Periodic parent IngestionJob atomic updates without write-lock contention
 *  - Backpressure: stream.pause() before bulkWrite(), stream.resume() after
 *  - Exponential back-off retry on transient errors (up to 5 attempts)
 */
class DestinationBuffer extends Writable {
  /**
   * @param {object}   options
   * @param {object}   [options.model]                  Mongoose model (default: StagingData)
   * @param {object}   [options.dlqModel]               DLQ model for schema-rejected docs
   * @param {object}   [options.jobModel]               IngestionJob model for progress updates
   * @param {object}   [options.targetSchema]           Optional TargetSchema definition
   * @param {function} [options.schemaValidator]        Optional custom doc validator
   * @param {object}   [options.eventBus]               Internal event bus (default: dbEventBus)
   * @param {string}   [options.fileId]                 Unique file identifier
   * @param {string}   [options.jobId]                  Job identifier
   * @param {number}   [options.batchSize=5000]         Micro-batch threshold (default: 5,000)
   * @param {number}   [options.flushTimeoutMs=750]     Inactivity flush timer (ms)
   * @param {string}   [options.writeMethod=bulkWrite]  bulkWrite | insertMany
   * @param {object}   [options.writeConcern]           Optional write concern { w: 1, j: false }
   * @param {number}   [options.jobUpdateThrottleMs=1000] Periodic IngestionJob update throttle window
   * @param {object}   [options.metadata={}]            Metadata attached per document
   * @param {function} [options.onBatchFlushed]         Called after each batch flush
   * @param {function} [options.transformDocument]      Optional doc transformer
   * @param {boolean}  [options.wrapPayload]            Wrap as StagingData envelope
   * @param {object}   [options.upstreamReadable]       Readable to pause/resume
   * @param {number}   [options.retryMaxAttempts=5]
   * @param {number}   [options.retryBaseDelayMs=150]
   * @param {number}   [options.retryMaxDelayMs=8000]
   * @param {boolean}  [options.enableSchemaValidation=true]
   */
  constructor(options = {}) {
    super({ objectMode: true, highWaterMark: options.highWaterMark || 16 });

    this.model = options.model || StagingData;
    if (!this.model) throw new Error('[DestinationBuffer] A target mongoose model must be provided.');

    this.dlqModel     = options.dlqModel || DeadLetterQueue;
    this.jobModel     = options.jobModel || IngestionJob;
    this.targetSchema = options.targetSchema || null;
    this.schemaValidator = options.schemaValidator || options.validator || null;
    this.eventBus     = options.eventBus || dbEventBus;

    this.fileId = options.fileId || `file_${crypto.randomUUID()}`;
    this.jobId  = options.jobId  || this.fileId;

    // Micro-batch threshold (defaults to 5,000 documents) & dual flush timer
    this.batchSize      = options.batchSize      !== undefined ? options.batchSize      : 5000;
    this.flushTimeoutMs = options.flushTimeoutMs !== undefined ? options.flushTimeoutMs : 750;

    this.writeMethod       = options.writeMethod    || 'bulkWrite';
    this.writeConcern      = options.writeConcern   !== undefined ? options.writeConcern   : null;
    this.metadata          = options.metadata       || {};
    this.onBatchFlushed    = options.onBatchFlushed || null;
    this.transformDocument = options.transformDocument || null;

    // Upstream readable for backpressure coupling
    this.upstreamReadable = options.upstreamReadable || null;

    // Retry config
    this.retryMaxAttempts = options.retryMaxAttempts !== undefined ? options.retryMaxAttempts : 5;
    this.retryBaseDelayMs = options.retryBaseDelayMs !== undefined ? options.retryBaseDelayMs : 150;
    this.retryMaxDelayMs  = options.retryMaxDelayMs  !== undefined ? options.retryMaxDelayMs  : 8000;

    // Schema validation configuration
    this.enableSchemaValidation = options.enableSchemaValidation !== undefined ? options.enableSchemaValidation : true;

    this.wrapPayload = options.wrapPayload !== undefined
      ? options.wrapPayload
      : (this.model.modelName === 'StagingData' || !this.model.schema || Boolean(this.model.schema && this.model.schema.paths && this.model.schema.paths.payload));

    this.buffer              = [];
    this.batchIndex          = 0;
    this.totalIngested       = 0;
    this.totalFlushedBatches = 0;
    this.totalSchemaRejected = 0;
    this.startTime           = Date.now();
    this.flushTimer          = null;
    this._currentFlush       = null;

    // Database-level performance indicators state
    this.cumulativeDocumentsCommitted = 0;
    this.totalBatchesCommitted        = 0;
    this.totalDbIoDurationMs          = 0;
    this.lastBatchWriteDurationMs     = 0;
    this.lastDbIoLatencyMs            = 0;

    // Periodic parent IngestionJob atomic update state (write-lock contention prevention)
    this.jobUpdateThrottleMs      = options.jobUpdateThrottleMs !== undefined ? options.jobUpdateThrottleMs : 1000;
    this._pendingJobProcessedDelta = 0;
    this._pendingJobErrorDelta     = 0;
    this._lastJobUpdateAt          = 0;
    this._jobUpdateTimer           = null;
  }

  // ── Timer helpers ────────────────────────────────────────────────────────

  _scheduleTimeoutFlush() {
    if (this.flushTimer || !this.flushTimeoutMs || this.flushTimeoutMs <= 0) return;
    this.flushTimer = setTimeout(() => this._handleTimeoutFlush(), this.flushTimeoutMs);
    if (this.flushTimer && typeof this.flushTimer.unref === 'function') this.flushTimer.unref();
  }

  _clearTimeoutTimer() {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
  }

  async _handleTimeoutFlush() {
    this.flushTimer = null;
    if (this.buffer.length > 0) {
      try { await this.flush(); }
      catch (err) { if (typeof this.emit === 'function') this.emit('error', err); }
    }
  }

  // ── Periodic IngestionJob Updater (Contention-Free) ──────────────────────

  /**
   * Atomically updates parent IngestionJob record using MongoDB $inc and $set.
   * Throttled to avoid WiredTiger document write-lock contention and Mongoose VersionError.
   *
   * @param {boolean} [force=false] - Force immediate execution bypassing throttle window
   */
  async _flushJobProgress(force = false) {
    if (!this.jobModel || (!this._pendingJobProcessedDelta && !this._pendingJobErrorDelta)) {
      return;
    }

    const now = Date.now();
    if (!force && this._lastJobUpdateAt && (now - this._lastJobUpdateAt < this.jobUpdateThrottleMs)) {
      if (!this._jobUpdateTimer) {
        const remaining = Math.max(this.jobUpdateThrottleMs - (now - this._lastJobUpdateAt), 50);
        this._jobUpdateTimer = setTimeout(() => {
          this._jobUpdateTimer = null;
          this._flushJobProgress(false).catch(err => {
            console.warn(`[DestinationBuffer] Periodic IngestionJob progress update warning: ${err.message}`);
          });
        }, remaining);
        if (this._jobUpdateTimer.unref) this._jobUpdateTimer.unref();
      }
      return;
    }

    if (this._jobUpdateTimer) {
      clearTimeout(this._jobUpdateTimer);
      this._jobUpdateTimer = null;
    }

    const processedDelta = this._pendingJobProcessedDelta;
    const errorDelta = this._pendingJobErrorDelta;
    this._pendingJobProcessedDelta = 0;
    this._pendingJobErrorDelta = 0;
    this._lastJobUpdateAt = now;

    const isDbConnected = !mongoose.connection || mongoose.connection.readyState === 1 || Boolean(this.jobModel.getOperations);
    if (!isDbConnected) {
      return;
    }

    const elapsedSec = Math.max((now - this.startTime) / 1000, 0.001);
    const rollingRate = +(this.cumulativeDocumentsCommitted / elapsedSec).toFixed(2);

    try {
      if (typeof this.jobModel.updateProgressAtomic === 'function') {
        await this.jobModel.updateProgressAtomic(this.jobId, {
          processedDelta,
          errorDelta,
          currentRateRowsPerSec: rollingRate,
          lastProgressAt: new Date(now)
        });
      } else if (typeof this.jobModel.updateOne === 'function') {
        await this.jobModel.updateOne(
          { jobId: this.jobId },
          {
            $inc: {
              totalRowsProcessed: processedDelta,
              errorCount: errorDelta,
              validRows: Math.max(0, processedDelta - errorDelta)
            },
            $set: {
              lastProgressAt: new Date(now),
              currentRateRowsPerSec: rollingRate
            }
          },
          { writeConcern: { w: 1, j: false } }
        );
      }
    } catch (err) {
      console.warn(`[DestinationBuffer] Non-blocking IngestionJob update warning: ${err.message}`);
    }
  }

  // ── Writable interface ───────────────────────────────────────────────────

  async push(record) {
    this.buffer.push(record);
    if (this.buffer.length >= this.batchSize) {
      this._clearTimeoutTimer();
      await this.flush();
    } else {
      this._scheduleTimeoutFlush();
    }
  }

  /**
   * _write is the stream hot path. When threshold is reached:
   *  1. Pause the upstream readable (backpressure)
   *  2. Await the bulkWrite
   *  3. Resume the readable
   *  4. Invoke callback
   */
  async _write(record, encoding, callback) {
    this.buffer.push(record);

    if (this.buffer.length >= this.batchSize) {
      // Backpressure: pause upstream while write is in flight
      if (this.upstreamReadable && typeof this.upstreamReadable.pause === 'function') {
        this.upstreamReadable.pause();
      }
      this._clearTimeoutTimer();
      try {
        await this.flush();
        callback();
      } catch (err) {
        callback(err);
      } finally {
        if (this.upstreamReadable && typeof this.upstreamReadable.resume === 'function') {
          this.upstreamReadable.resume();
        }
      }
    } else {
      this._scheduleTimeoutFlush();
      callback();
    }
  }

  async _final(callback) {
    this._clearTimeoutTimer();
    try {
      if (this.buffer.length > 0) await this.flush();
      if (this._currentFlush)     await this._currentFlush;
      // Guarantee final parent IngestionJob progress flush
      await this._flushJobProgress(true);
      callback();
    } catch (err) { callback(err); }
  }

  _destroy(err, callback) {
    this._clearTimeoutTimer();
    if (this._jobUpdateTimer) {
      clearTimeout(this._jobUpdateTimer);
      this._jobUpdateTimer = null;
    }
    super._destroy(err, callback);
  }

  // ── Core flush ───────────────────────────────────────────────────────────

  async flush() {
    this._clearTimeoutTimer();
    if (this.buffer.length === 0) {
      if (this._currentFlush) await this._currentFlush;
      return;
    }

    const currentBatch     = this.buffer;
    this.buffer            = [];
    this.batchIndex++;
    const batchId           = `b_${this.batchIndex}_${Date.now()}`;
    const batchStartTime    = Date.now();
    const count             = currentBatch.length;
    const currentBatchIndex = this.batchIndex;

    const performFlush = async () => {
      // 1. Build destination documents
      let documents;
      if (typeof this.transformDocument === 'function') {
        documents = currentBatch.map((item, idx) =>
          this.transformDocument(item, {
            fileId: this.fileId, batchId, batchIndex: currentBatchIndex,
            rowNumber: item.rowNumber !== undefined ? item.rowNumber : (this.totalIngested + idx + 1)
          })
        );
      } else if (this.wrapPayload) {
        documents = currentBatch.map((item, idx) => {
          if (item && item.fileId && item.payload) {
            return {
              fileId: item.fileId, jobId: item.jobId || this.jobId,
              batchId: item.batchId || batchId,
              rowNumber: item.rowNumber !== undefined ? item.rowNumber : (this.totalIngested + idx + 1),
              metadata: { ...this.metadata, ...item.metadata, ingestedAt: new Date(), batchNumber: currentBatchIndex },
              payload: item.payload
            };
          }
          return {
            fileId: this.fileId, jobId: this.jobId, batchId,
            rowNumber: item.rowNumber !== undefined ? item.rowNumber : (this.totalIngested + idx + 1),
            metadata: { ...this.metadata, ingestedAt: new Date(), batchNumber: currentBatchIndex },
            payload: item.payload !== undefined ? item.payload : item
          };
        });
      } else {
        documents = currentBatch.map(item => item.payload !== undefined ? item.payload : item);
      }

      // 2. Collection-level schema validation checks on final target documents
      let docsToInsert = documents;
      let rejectedDocs = [];
      if (this.enableSchemaValidation) {
        const { valid, rejected } = validateDocumentsAgainstSchema(
          documents,
          this.model,
          this.targetSchema,
          this.schemaValidator
        );
        if (rejected.length > 0) {
          rejectedDocs = rejected;
          this.totalSchemaRejected += rejected.length;
          console.warn(`[DestinationBuffer] Schema validation rejected ${rejected.length} doc(s) in batch ${currentBatchIndex}. Routing to DLQ.`);
          // Persist schema-rejected records to DLQ with full error traces
          await this._persistRejectedToDLQ(rejected, currentBatchIndex);
        }
        docsToInsert = valid;
      }

      // 3. Database Write & exact Database I/O Latency Calculation
      let dbIoLatencyMs = 0;
      if (docsToInsert.length > 0) {
        const ioStartTime = Date.now();
        await retryWithBackoff(
          async () => {
            const writeOpts = { ordered: false };
            if (this.writeConcern) {
              writeOpts.writeConcern = this.writeConcern;
            }

            if (this.writeMethod === 'insertMany') {
              await this.model.insertMany(docsToInsert, { ...writeOpts, lean: true });
            } else {
              const bulkOps = docsToInsert.map(doc => ({ insertOne: { document: doc } }));
              await this.model.bulkWrite(bulkOps, writeOpts);
            }
          },
          {
            maxAttempts: this.retryMaxAttempts,
            baseDelayMs: this.retryBaseDelayMs,
            maxDelayMs: this.retryMaxDelayMs,
            label: `[DestinationBuffer batch=${currentBatchIndex}]`
          }
        );
        dbIoLatencyMs = Math.max(Date.now() - ioStartTime, 0);
      } else {
        console.warn(`[DestinationBuffer] Batch ${currentBatchIndex}: all ${count} docs rejected by schema validation - skipped database write.`);
      }

      // 4. Calculate Database-Level Performance Indicators
      const writeDurationMs = Date.now() - batchStartTime;
      this.totalIngested += count;
      this.cumulativeDocumentsCommitted += docsToInsert.length;
      this.totalFlushedBatches++;
      this.totalBatchesCommitted++;
      this.lastBatchWriteDurationMs = writeDurationMs;
      this.lastDbIoLatencyMs        = dbIoLatencyMs;
      this.totalDbIoDurationMs     += dbIoLatencyMs;

      const stats = {
        jobId: this.jobId,
        fileId: this.fileId,
        batchId,
        batchNumber: currentBatchIndex,
        batchSize: count,
        insertedCount: docsToInsert.length,
        rejectedCount: rejectedDocs.length,
        // Database-level performance indicators:
        writeDurationMs,                                    // write duration per 5,000-record batch
        cumulativeDocumentsCommitted: this.cumulativeDocumentsCommitted, // cumulative documents committed
        dbIoLatencyMs,                                      // database I/O latency (MongoDB write execution time)
        totalIngested: this.totalIngested,
        avgIoLatencyPerDocMs: +(dbIoLatencyMs / Math.max(docsToInsert.length, 1)).toFixed(4),
        heapUsedMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
        rssMB:      +(process.memoryUsage().rss       / 1024 / 1024).toFixed(2),
        timestamp:  new Date().toISOString()
      };

      // 5. Forward database write metrics to internal event bus for client WebSocket broadcasting
      if (this.eventBus && typeof this.eventBus.publishWriteMetrics === 'function') {
        this.eventBus.publishWriteMetrics(stats);
      }

      // 6. Periodically update parent IngestionJob without inducing write-lock contention
      this._pendingJobProcessedDelta += count;
      this._pendingJobErrorDelta += rejectedDocs.length;
      this._flushJobProgress(false).catch(err => {
        console.warn(`[DestinationBuffer] Periodic IngestionJob update warning: ${err.message}`);
      });

      this.emit('batchFlushed', stats);
      if (typeof this.onBatchFlushed === 'function') this.onBatchFlushed(stats);
    };

    const prev = this._currentFlush || Promise.resolve();
    const next = prev.catch(() => {}).then(performFlush);
    this._currentFlush = next;
    try {
      await next;
    } finally {
      if (this._currentFlush === next) this._currentFlush = null;
    }
  }

  /**
   * Persist schema-rejected docs to DLQ with full error traces.
   *
   * @param {Array<{doc, error, failedField?, details?, stackTrace?}>} rejected
   * @param {number} batchIndex
   */
  async _persistRejectedToDLQ(rejected, batchIndex) {
    if (!this.dlqModel || rejected.length === 0) return;
    const dlqDocs = rejected.map(item => {
      const doc = item.doc || item;
      const error = item.error || {};
      const failedField = item.failedField || (error.errors ? Object.keys(error.errors)[0] : null);
      const stackTrace = item.stackTrace || error.stack || null;
      const details = item.details || (error.errors
        ? { validationErrors: Object.fromEntries(Object.entries(error.errors).map(([k, v]) => [k, v.message || String(v)])) }
        : { message: error.message || 'Schema validation failure' });

      return {
        jobId:          doc.jobId || this.jobId,
        fileId:         doc.fileId || this.fileId,
        rowNumber:      doc.rowNumber !== undefined ? doc.rowNumber : 0,
        rawData:        doc.payload !== undefined ? doc.payload : doc,
        rawRow:         doc.payload !== undefined ? doc.payload : doc,
        rejectedReason: error.message || 'Collection-level schema validation failed',
        errorMessage:   error.message || 'Collection-level schema validation failed',
        errorType:      item.errorType || 'SCHEMA_VALIDATION_FAILED',
        failedField:    failedField || null,
        details: {
          ...details,
          batchIndex,
          source: 'DestinationBuffer.collectionSchemaValidation'
        },
        stackTrace: stackTrace || null,
        timestamp:  new Date(),
        createdAt:  new Date()
      };
    });

    const writeOpts = { ordered: false };
    if (this.writeConcern) writeOpts.writeConcern = this.writeConcern;
    const bulkOps = dlqDocs.map(d => ({ insertOne: { document: d } }));
    await this.dlqModel.bulkWrite(bulkOps, writeOpts);
  }

  // ── Public API & Metrics ─────────────────────────────────────────────────

  async close() {
    this._clearTimeoutTimer();
    if (this.buffer.length > 0) await this.flush();
    if (this._currentFlush)     await this._currentFlush;
    await this._flushJobProgress(true);
  }

  getMetrics() {
    const elapsedSec = Math.max((Date.now() - this.startTime) / 1000, 0.001);
    return {
      fileId: this.fileId,
      jobId: this.jobId,
      totalIngested: this.totalIngested,
      totalBatches: this.totalFlushedBatches,
      totalBatchesCommitted: this.totalBatchesCommitted,
      cumulativeDocumentsCommitted: this.cumulativeDocumentsCommitted,
      totalSchemaRejected: this.totalSchemaRejected,
      pendingBuffer: this.buffer.length,
      elapsedSec: +elapsedSec.toFixed(2),
      writeDurationMs: this.lastBatchWriteDurationMs,
      dbIoLatencyMs: this.lastDbIoLatencyMs,
      avgDbIoLatencyMs: this.totalBatchesCommitted > 0 ? +(this.totalDbIoDurationMs / this.totalBatchesCommitted).toFixed(2) : 0,
      throughputRowsPerSec: Math.round(this.cumulativeDocumentsCommitted / elapsedSec),
      currentHeapUsedMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
      currentRssMB:      +(process.memoryUsage().rss       / 1024 / 1024).toFixed(2)
    };
  }

  getStats() { return this.getMetrics(); }

  /**
   * Returns isolated database-level performance indicators.
   */
  getDatabasePerformanceIndicators() {
    const elapsedSec = Math.max((Date.now() - this.startTime) / 1000, 0.001);
    return {
      batchSize: this.batchSize,
      writeDurationMs: this.lastBatchWriteDurationMs,
      cumulativeDocumentsCommitted: this.cumulativeDocumentsCommitted,
      dbIoLatencyMs: this.lastDbIoLatencyMs,
      totalBatchesCommitted: this.totalBatchesCommitted,
      totalDbIoDurationMs: this.totalDbIoDurationMs,
      avgDbIoLatencyMs: this.totalBatchesCommitted > 0 ? +(this.totalDbIoDurationMs / this.totalBatchesCommitted).toFixed(2) : 0,
      totalSchemaRejected: this.totalSchemaRejected,
      throughputRowsPerSec: Math.round(this.cumulativeDocumentsCommitted / elapsedSec)
    };
  }
}

// ---------------------------------------------------------------------------
// DLQBuffer
// ---------------------------------------------------------------------------

/**
 * DLQBuffer:
 * Micro-batching sink for invalid/rejected rows -> DeadLetterQueue collection.
 *
 * Core Capabilities:
 *  - Micro-batch size: up to 500 records
 *  - 750ms inactivity flush timer
 *  - Full error traces: errorType, errorMessage, details, stackTrace, rawRow, failedField
 *  - Direct persistence of sandbox-rejected records received from Developer 1
 *  - Exponential back-off retry on transient MongoDB errors
 */
class DLQBuffer extends Writable {
  /**
   * @param {object}   options
   * @param {object}   [options.model]              DLQ Mongoose model
   * @param {string}   [options.jobId]              Associated ingestion Job ID
   * @param {string}   [options.fileId]             File ID alias
   * @param {number}   [options.batchSize=500]      Micro-batch size
   * @param {number}   [options.flushTimeoutMs=750] Inactivity timer (ms)
   * @param {string}   [options.writeMethod]        bulkWrite | insertMany
   * @param {object}   [options.writeConcern]       Optional write concern
   * @param {function} [options.onBatchFlushed]     Callback after each batch flush
   * @param {function} [options.formatError]        Custom error transformer
   * @param {number}   [options.retryMaxAttempts=5]
   * @param {number}   [options.retryBaseDelayMs=150]
   * @param {number}   [options.retryMaxDelayMs=8000]
   */
  constructor(options = {}) {
    super({ objectMode: true, highWaterMark: options.highWaterMark || 16 });

    this.model        = options.model || options.dlqModel || DeadLetterQueue;
    this.jobId        = options.jobId  || options.fileId || `job_${crypto.randomUUID()}`;
    this.fileId       = options.fileId || this.jobId;
    this.batchSize    = options.batchSize       || 500;
    this.flushTimeoutMs = options.flushTimeoutMs !== undefined ? options.flushTimeoutMs : 750;
    this.writeMethod  = options.writeMethod || 'bulkWrite';
    this.writeConcern = options.writeConcern !== undefined ? options.writeConcern : null;
    this.onBatchFlushed = options.onBatchFlushed || null;
    this.formatError  = options.formatError || null;

    this.retryMaxAttempts = options.retryMaxAttempts !== undefined ? options.retryMaxAttempts : 5;
    this.retryBaseDelayMs = options.retryBaseDelayMs !== undefined ? options.retryBaseDelayMs : 150;
    this.retryMaxDelayMs  = options.retryMaxDelayMs  !== undefined ? options.retryMaxDelayMs  : 8000;

    this.buffer              = [];
    this.batchIndex          = 0;
    this.totalLoggedErrors   = 0;
    this.totalFlushedBatches = 0;
    this.startTime           = Date.now();
    this.flushTimer          = null;
    this._currentFlush       = null;
  }

  _scheduleTimeoutFlush() {
    if (this.flushTimer || !this.flushTimeoutMs || this.flushTimeoutMs <= 0) return;
    this.flushTimer = setTimeout(() => this._handleTimeoutFlush(), this.flushTimeoutMs);
    if (this.flushTimer && typeof this.flushTimer.unref === 'function') this.flushTimer.unref();
  }

  _clearTimeoutTimer() {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
  }

  async _handleTimeoutFlush() {
    this.flushTimer = null;
    if (this.buffer.length > 0) {
      try { await this.flush(); }
      catch (err) { if (typeof this.emit === 'function') this.emit('error', err); }
    }
  }

  async push(errorDoc) {
    if (!errorDoc) return;
    if (Array.isArray(errorDoc)) { for (const item of errorDoc) await this.push(item); return; }
    this.buffer.push(errorDoc);
    if (this.buffer.length >= this.batchSize) {
      this._clearTimeoutTimer();
      await this.flush();
    } else {
      this._scheduleTimeoutFlush();
    }
  }

  /**
   * Dedicated helper to persist sandbox-rejected records received from Developer 1.
   * Captures full error traces including JavaScript stack traces and sandbox diagnostics.
   *
   * @param {object|Array<object>} sandboxError
   */
  async pushSandboxRejected(sandboxError) {
    if (!sandboxError) return;
    if (Array.isArray(sandboxError)) {
      for (const item of sandboxError) await this.pushSandboxRejected(item);
      return;
    }

    const reason = sandboxError.rejectedReason ||
                   sandboxError.errorMessage ||
                   (sandboxError.error && sandboxError.error.message) ||
                   (typeof sandboxError.error === 'string' ? sandboxError.error : 'Sandbox execution rejected record');

    const stackTrace = sandboxError.stackTrace ||
                       sandboxError.stack ||
                       (sandboxError.error && sandboxError.error.stack) ||
                       null;

    const normalized = {
      ...sandboxError,
      errorType: sandboxError.errorType || 'SANDBOX_EXECUTION_FAILED',
      rejectedReason: reason,
      errorMessage: reason,
      stackTrace,
      details: {
        ...(sandboxError.details || {}),
        sandboxSource: 'Developer1.IsolatedVmSandbox',
        sandboxError: sandboxError.sandboxError || (sandboxError.error ? String(sandboxError.error) : null)
      }
    };

    return this.push(normalized);
  }

  async _write(record, encoding, callback) {
    try { await this.push(record); callback(); } catch (err) { callback(err); }
  }

  async _final(callback) {
    this._clearTimeoutTimer();
    try {
      if (this.buffer.length > 0) await this.flush();
      if (this._currentFlush)     await this._currentFlush;
      callback();
    } catch (err) { callback(err); }
  }

  _destroy(err, callback) {
    this._clearTimeoutTimer();
    super._destroy(err, callback);
  }

  /**
   * Normalise error records into full DLQ documents.
   * Captures: errorType, errorMessage, details, stackTrace, rawRow, failedField.
   */
  _normalizeRecord(err, idx) {
    if (typeof this.formatError === 'function') {
      return this.formatError(err, { jobId: this.jobId, fileId: this.fileId, index: idx });
    }

    const jobId     = err.jobId     || err.fileId || this.jobId;
    const fileId    = err.fileId    || err.jobId  || this.fileId;
    const rowNumber = typeof err.rowNumber === 'number' ? err.rowNumber : (this.totalLoggedErrors + idx + 1);
    const rawData   = err.rawData   !== undefined ? err.rawData  : (err.rawRow !== undefined ? err.rawRow : err);
    const rawRow    = err.rawRow    !== undefined ? err.rawRow   : rawData;
    const reason    = err.rejectedReason ||
                      err.errorMessage ||
                      (err.error && err.error.message) ||
                      (typeof err.error === 'string' ? err.error : 'Record rejected by validation');

    const errorType = err.errorType ||
                      (err.sandboxError || err.isSandbox ? 'SANDBOX_EXECUTION_FAILED' :
                      (err.failedField ? 'VALIDATION_FAILED' : 'MALFORMED_ROW'));

    const failedField = err.failedField || (err.details && err.details.failedField) || null;
    const stackTrace = err.stackTrace ||
                       err.stack ||
                       (err.error && err.error.stack) ||
                       (err.details && err.details.stackTrace) ||
                       null;

    const details = err.details ? { ...err.details } : (failedField ? { failedField } : {});
    if (err.sandboxError && !details.sandboxError) {
      details.sandboxError = typeof err.sandboxError === 'object' ? err.sandboxError : String(err.sandboxError);
    }

    const timestamp = err.timestamp || err.createdAt || new Date();

    return {
      jobId, fileId, rowNumber, rawData, rawRow,
      rejectedReason: reason, errorMessage: reason,
      errorType, failedField, details, stackTrace,
      timestamp, createdAt: timestamp
    };
  }

  async flush() {
    this._clearTimeoutTimer();
    if (this.buffer.length === 0 || !this.model) {
      if (this._currentFlush) await this._currentFlush;
      return;
    }

    const currentBatch     = this.buffer;
    this.buffer            = [];
    this.batchIndex++;
    const batchStartTime    = Date.now();
    const count             = currentBatch.length;
    const currentBatchIndex = this.batchIndex;

    const performFlush = async () => {
      const documents = currentBatch.map((err, idx) => this._normalizeRecord(err, idx));

      await retryWithBackoff(
        async () => {
          const writeOpts = { ordered: false };
          if (this.writeConcern) {
            writeOpts.writeConcern = this.writeConcern;
          }

          if (this.writeMethod === 'insertMany') {
            await this.model.insertMany(documents, { ...writeOpts, lean: true });
          } else {
            const bulkOps = documents.map(doc => ({ insertOne: { document: doc } }));
            await this.model.bulkWrite(bulkOps, writeOpts);
          }
        },
        { maxAttempts: this.retryMaxAttempts, baseDelayMs: this.retryBaseDelayMs, maxDelayMs: this.retryMaxDelayMs, label: `[DLQBuffer batch=${currentBatchIndex}]` }
      );

      this.totalLoggedErrors += count;
      this.totalFlushedBatches++;

      const stats = {
        batchNumber: currentBatchIndex, batchSize: count,
        durationMs: Date.now() - batchStartTime,
        totalLoggedErrors: this.totalLoggedErrors
      };
      this.emit('batchFlushed', stats);
      if (typeof this.onBatchFlushed === 'function') this.onBatchFlushed(stats);
    };

    const prev = this._currentFlush || Promise.resolve();
    const next = prev.catch(() => {}).then(performFlush);
    this._currentFlush = next;
    try {
      await next;
    } finally {
      if (this._currentFlush === next) this._currentFlush = null;
    }
  }

  async close() {
    this._clearTimeoutTimer();
    if (this.buffer.length > 0) await this.flush();
    if (this._currentFlush)     await this._currentFlush;
  }

  getStats() {
    const elapsedSec = Math.max((Date.now() - this.startTime) / 1000, 0.001);
    return {
      jobId: this.jobId, fileId: this.fileId,
      totalLoggedErrors: this.totalLoggedErrors, totalBatches: this.totalFlushedBatches,
      pendingBuffer: this.buffer.length, elapsedSec: +elapsedSec.toFixed(2)
    };
  }

  getMetrics() { return this.getStats(); }
}

/**
 * Top-level convenience function for Developer 1 to persist sandbox-rejected records
 * directly into the DeadLetterQueue with full error traces.
 *
 * @param {Array<object>|object} records - One or more sandbox-rejected records
 * @param {object}               [options]
 * @param {object}               [options.dlqModel=DeadLetterQueue]
 * @param {string}               [options.jobId]
 * @param {string}               [options.fileId]
 * @param {object}               [options.writeConcern]
 * @returns {Promise<object>} MongoDB bulkWrite result
 */
async function persistSandboxRejectedRecords(records, options = {}) {
  const dlqModel = options.dlqModel || options.model || DeadLetterQueue;
  const jobId = options.jobId || 'sandbox_job';
  const fileId = options.fileId || jobId;
  const list = Array.isArray(records) ? records : [records];
  if (list.length === 0 || !dlqModel) return { insertedCount: 0 };

  const documents = list.map((err, idx) => {
    const rowNumber = typeof err.rowNumber === 'number' ? err.rowNumber : (idx + 1);
    const rawData = err.rawData !== undefined ? err.rawData : (err.rawRow !== undefined ? err.rawRow : err);
    const rawRow = err.rawRow !== undefined ? err.rawRow : rawData;
    const reason = err.rejectedReason ||
                   err.errorMessage ||
                   (err.error && err.error.message) ||
                   (typeof err.error === 'string' ? err.error : 'Sandbox transformation rejected row');

    const errorType = err.errorType || 'SANDBOX_EXECUTION_FAILED';
    const stackTrace = err.stackTrace || err.stack || (err.error && err.error.stack) || null;
    const details = err.details ? { ...err.details } : (err.sandboxError ? { sandboxError: err.sandboxError } : {});

    return {
      jobId: err.jobId || jobId,
      fileId: err.fileId || fileId,
      rowNumber,
      rawData,
      rawRow,
      rejectedReason: reason,
      errorMessage: reason,
      errorType,
      failedField: err.failedField || null,
      details,
      stackTrace,
      timestamp: err.timestamp || new Date(),
      createdAt: new Date()
    };
  });

  const writeOpts = { ordered: false };
  if (options.writeConcern) writeOpts.writeConcern = options.writeConcern;
  const bulkOps = documents.map(doc => ({ insertOne: { document: doc } }));
  return dlqModel.bulkWrite(bulkOps, writeOpts);
}

module.exports = {
  DestinationBuffer,
  DLQBuffer,
  MongoBatchIngestionStream: DestinationBuffer,
  IsolatedErrorBatcher:      DLQBuffer,
  retryWithBackoff,
  validateDocumentsAgainstSchema,
  persistSandboxRejectedRecords,
  dbEventBus,
  STAGING_WRITE_CONCERN
};
