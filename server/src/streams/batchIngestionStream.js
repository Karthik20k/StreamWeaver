'use strict';

const { Writable } = require('node:stream');
const crypto = require('node:crypto');
const StagingData = require('../models/StagingData');
const DeadLetterQueue = require('../models/DeadLetterQueue');

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
 * Validate an array of plain docs against a Mongoose model schema (sync).
 * Returns { valid: doc[], rejected: { doc, error }[] }
 */
function validateDocumentsAgainstSchema(documents, Model) {
  const valid = [], rejected = [];
  for (const doc of documents) {
    try {
      const inst = new Model(doc);
      const err  = inst.validateSync();
      if (err) rejected.push({ doc, error: err });
      else     valid.push(doc);
    } catch (err) {
      rejected.push({ doc, error: err });
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
 * Improvements:
 *  - Batch threshold: 5,000 docs
 *  - Dual flush: size threshold OR 750ms inactivity timer
 *  - Write concern: w:1, j:false for maximum throughput
 *  - Backpressure: stream.pause() before bulkWrite(), stream.resume() after
 *  - Exponential back-off retry on transient errors (up to 5 attempts)
 *  - Collection-level schema validation; rejects routed to DLQ with full traces
 */
class DestinationBuffer extends Writable {
  /**
   * @param {object}   options
   * @param {object}   [options.model]                  Mongoose model (default: StagingData)
   * @param {object}   [options.dlqModel]               DLQ model for schema-rejected docs
   * @param {string}   [options.fileId]                 Unique file identifier
   * @param {string}   [options.jobId]                  Job identifier
   * @param {number}   [options.batchSize=5000]         Micro-batch threshold
   * @param {number}   [options.flushTimeoutMs=750]     Inactivity flush timer (ms)
   * @param {string}   [options.writeMethod=bulkWrite]  bulkWrite | insertMany
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

    this.dlqModel = options.dlqModel || DeadLetterQueue;
    this.fileId   = options.fileId || `file_${crypto.randomUUID()}`;
    this.jobId    = options.jobId  || this.fileId;

    // Dual flush thresholds
    this.batchSize      = options.batchSize      !== undefined ? options.batchSize      : 5000;
    this.flushTimeoutMs = options.flushTimeoutMs !== undefined ? options.flushTimeoutMs : 750;

    this.writeMethod       = options.writeMethod    || 'bulkWrite';
    this.metadata          = options.metadata       || {};
    this.onBatchFlushed    = options.onBatchFlushed || null;
    this.transformDocument = options.transformDocument || null;

    // Upstream readable for backpressure coupling
    this.upstreamReadable = options.upstreamReadable || null;

    // Retry config
    this.retryMaxAttempts = options.retryMaxAttempts !== undefined ? options.retryMaxAttempts : 5;
    this.retryBaseDelayMs = options.retryBaseDelayMs !== undefined ? options.retryBaseDelayMs : 150;
    this.retryMaxDelayMs  = options.retryMaxDelayMs  !== undefined ? options.retryMaxDelayMs  : 8000;

    // Schema validation
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
   * _write is the hot path. When the size threshold is reached:
   *  1. Pause the upstream readable (backpressure)
   *  2. Await the bulkWrite
   *  3. Resume the readable
   *  4. Invoke the stream callback
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
        // Resume streaming once the batch write resolves
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
      callback();
    } catch (err) { callback(err); }
  }

  _destroy(err, callback) {
    this._clearTimeoutTimer();
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
      // 1. Build documents
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

      // 2. Collection-level schema validation
      let docsToInsert = documents;
      if (this.enableSchemaValidation && this.model && this.model.schema) {
        const { valid, rejected } = validateDocumentsAgainstSchema(documents, this.model);
        if (rejected.length > 0) {
          this.totalSchemaRejected += rejected.length;
          console.warn(`[DestinationBuffer] Schema validation rejected ${rejected.length} doc(s) in batch ${currentBatchIndex}. Routing to DLQ.`);
          this._persistRejectedToDLQ(rejected, currentBatchIndex).catch(e =>
            console.error(`[DestinationBuffer] DLQ persist error: ${e.message}`)
          );
        }
        docsToInsert = valid;
      }

      if (docsToInsert.length === 0) {
        console.warn(`[DestinationBuffer] Batch ${currentBatchIndex}: no valid docs after schema validation - skipping write.`);
        return;
      }

      // 3. Write with optimised write concern + exponential back-off retry
      await retryWithBackoff(
        async () => {
          if (this.writeMethod === 'insertMany') {
            await this.model.insertMany(docsToInsert, { ordered: false, lean: true, writeConcern: STAGING_WRITE_CONCERN });
          } else {
            const bulkOps = docsToInsert.map(doc => ({ insertOne: { document: doc } }));
            await this.model.bulkWrite(bulkOps, { ordered: false, writeConcern: STAGING_WRITE_CONCERN });
          }
        },
        { maxAttempts: this.retryMaxAttempts, baseDelayMs: this.retryBaseDelayMs, maxDelayMs: this.retryMaxDelayMs, label: `[DestinationBuffer batch=${currentBatchIndex}]` }
      );

      // 4. Stats + events
      const durationMs = Date.now() - batchStartTime;
      this.totalIngested += count;
      this.totalFlushedBatches++;

      const stats = {
        batchId, batchNumber: currentBatchIndex, batchSize: count,
        insertedCount: docsToInsert.length, rejectedCount: count - docsToInsert.length,
        durationMs, totalIngested: this.totalIngested,
        heapUsedMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
        rssMB:      +(process.memoryUsage().rss       / 1024 / 1024).toFixed(2)
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

  /**
   * Persist schema-rejected docs to DLQ with full error traces (fire-and-forget).
   * @param {Array<{doc, error}>} rejected
   * @param {number} batchIndex
   */
  async _persistRejectedToDLQ(rejected, batchIndex) {
    if (!this.dlqModel || rejected.length === 0) return;
    const dlqDocs = rejected.map(({ doc, error }) => ({
      jobId:          doc.jobId || this.jobId,
      fileId:         doc.fileId || this.fileId,
      rowNumber:      doc.rowNumber || 0,
      rawData:        doc.payload || doc,
      rawRow:         doc.payload || doc,
      rejectedReason: error.message || 'Schema validation failed',
      errorMessage:   error.message || 'Schema validation failed',
      errorType:      'SCHEMA_VALIDATION_FAILED',
      failedField:    error.errors ? Object.keys(error.errors)[0] || null : null,
      details: {
        validationErrors: error.errors
          ? Object.fromEntries(Object.entries(error.errors).map(([k, v]) => [k, v.message || String(v)]))
          : { message: error.message },
        batchIndex,
        source: 'DestinationBuffer.schemaValidation'
      },
      stackTrace: error.stack || null,
      timestamp:  new Date(),
      createdAt:  new Date()
    }));
    const bulkOps = dlqDocs.map(doc => ({ insertOne: { document: doc } }));
    await this.dlqModel.bulkWrite(bulkOps, { ordered: false, writeConcern: { w: 1, j: false } });
  }

  // ── Public API ───────────────────────────────────────────────────────────

  async close() {
    this._clearTimeoutTimer();
    if (this.buffer.length > 0) await this.flush();
    if (this._currentFlush)     await this._currentFlush;
  }

  getMetrics() {
    const elapsedSec = Math.max((Date.now() - this.startTime) / 1000, 0.001);
    return {
      fileId: this.fileId, jobId: this.jobId,
      totalIngested: this.totalIngested, totalBatches: this.totalFlushedBatches,
      totalSchemaRejected: this.totalSchemaRejected,
      pendingBuffer: this.buffer.length,
      elapsedSec: +elapsedSec.toFixed(2),
      throughputRowsPerSec: Math.round(this.totalIngested / elapsedSec),
      currentHeapUsedMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
      currentRssMB:      +(process.memoryUsage().rss       / 1024 / 1024).toFixed(2)
    };
  }

  getStats() { return this.getMetrics(); }
}

// ---------------------------------------------------------------------------
// DLQBuffer
// ---------------------------------------------------------------------------

/**
 * DLQBuffer:
 * Micro-batching sink for invalid/rejected rows -> DeadLetterQueue collection.
 *
 * - Collects up to 500 error rows before committing
 * - 750ms inactivity flush timer
 * - Full error traces: errorType, errorMessage, details, stackTrace, rawRow
 * - Exponential back-off retry on transient MongoDB errors
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
    const reason    = err.rejectedReason || err.errorMessage || err.error || 'Record rejected by validation';
    const errorType = err.errorType || (err.failedField ? 'VALIDATION_FAILED' : 'MALFORMED_ROW');
    const failedField = err.failedField || (err.details && err.details.failedField) || null;
    const details   = err.details   || (failedField ? { failedField } : {});
    const stackTrace = err.stack    || err.stackTrace || null;
    const timestamp = err.timestamp || err.createdAt  || new Date();

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
          if (this.writeMethod === 'insertMany') {
            await this.model.insertMany(documents, { ordered: false, lean: true, writeConcern: STAGING_WRITE_CONCERN });
          } else {
            const bulkOps = documents.map(doc => ({ insertOne: { document: doc } }));
            await this.model.bulkWrite(bulkOps, { ordered: false, writeConcern: STAGING_WRITE_CONCERN });
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

module.exports = {
  DestinationBuffer,
  DLQBuffer,
  MongoBatchIngestionStream: DestinationBuffer,
  IsolatedErrorBatcher:      DLQBuffer,
  retryWithBackoff,
  validateDocumentsAgainstSchema,
  STAGING_WRITE_CONCERN
};
