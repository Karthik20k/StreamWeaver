const { Writable } = require('node:stream');
const crypto = require('node:crypto');
const StagingData = require('../models/StagingData');
const DeadLetterQueue = require('../models/DeadLetterQueue');

/**
 * DestinationBuffer:
 * High-performance Writable Stream and micro-batching sink for clean records.
 * Gathers 1,000 clean records before executing an insertMany or bulkWrite({ ordered: false }).
 *
 * Includes an automatic flushing mechanism triggered by a timeout threshold (default: 500ms)
 * to clear trailing records at the end of a stream or during ingestion lulls.
 *
 * Implements strict backpressure: the stream's callback is paused while the database
 * write is in flight, keeping memory usage constant and preventing heap overflow.
 */
class DestinationBuffer extends Writable {
  /**
   * @param {object} options
   * @param {import('mongoose').Model} [options.model] - Target Mongoose Model (default: StagingData)
   * @param {string} [options.fileId] - Unique file or job identifier
   * @param {number} [options.batchSize=1000] - Micro-batch threshold (default 1,000)
   * @param {number} [options.flushTimeoutMs=500] - Trailing records timeout threshold in ms (default 500ms)
   * @param {'bulkWrite'|'insertMany'} [options.writeMethod='bulkWrite'] - MongoDB bulk insertion method
   * @param {object} [options.metadata={}] - Metadata attached to each document
   * @param {function} [options.onBatchFlushed] - Callback after each batch flush (batchStats)
   * @param {function} [options.transformDocument] - Optional custom document transformer
   * @param {boolean} [options.wrapPayload] - Whether to format as { fileId, batchId, rowNumber, metadata, payload }
   */
  constructor(options = {}) {
    super({ objectMode: true, highWaterMark: options.highWaterMark || 16 });

    this.model = options.model || StagingData;
    if (!this.model) {
      throw new Error('[DestinationBuffer] A target mongoose model must be provided or default model loaded.');
    }

    this.fileId = options.fileId || `file_${crypto.randomUUID()}`;
    this.batchSize = options.batchSize || 1000;
    this.flushTimeoutMs = options.flushTimeoutMs !== undefined ? options.flushTimeoutMs : 500;
    this.writeMethod = options.writeMethod || 'bulkWrite';
    this.metadata = options.metadata || {};
    this.onBatchFlushed = options.onBatchFlushed || null;
    this.transformDocument = options.transformDocument || null;

    // Detect if model expects wrapped payload (e.g. StagingData) or flat schema
    this.wrapPayload = options.wrapPayload !== undefined
      ? options.wrapPayload
      : (this.model.modelName === 'StagingData' || !this.model.schema || Boolean(this.model.schema?.paths?.payload));

    this.buffer = [];
    this.batchIndex = 0;
    this.totalIngested = 0;
    this.totalFlushedBatches = 0;
    this.startTime = Date.now();
    this.flushTimer = null;
    this._currentFlush = null;
  }

  /**
   * Schedule automatic timeout flush for trailing records
   */
  _scheduleTimeoutFlush() {
    if (this.flushTimer || !this.flushTimeoutMs || this.flushTimeoutMs <= 0) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this._handleTimeoutFlush();
    }, this.flushTimeoutMs);

    if (this.flushTimer && typeof this.flushTimer.unref === 'function') {
      this.flushTimer.unref();
    }
  }

  /**
   * Clear active timeout timer
   */
  _clearTimeoutTimer() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Internal timeout handler to flush trailing records
   */
  async _handleTimeoutFlush() {
    this.flushTimer = null;
    if (this.buffer.length > 0) {
      try {
        await this.flush();
      } catch (err) {
        if (typeof this.emit === 'function') {
          this.emit('error', err);
        } else {
          console.error(`[DestinationBuffer] Timeout flush error: ${err.message}`);
        }
      }
    }
  }

  /**
   * Procedural push for clean records
   * @param {object} record
   */
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
   * Ingestion write step with micro-batching and backpressure
   */
  async _write(record, encoding, callback) {
    this.buffer.push(record);

    if (this.buffer.length >= this.batchSize) {
      this._clearTimeoutTimer();
      try {
        await this.flush();
        callback();
      } catch (err) {
        callback(err);
      }
    } else {
      this._scheduleTimeoutFlush();
      // Buffer not full yet, immediately request next chunk
      callback();
    }
  }

  /**
   * Called automatically when the upstream stream has ended.
   * Flushes any remaining trailing records in the buffer.
   */
  async _final(callback) {
    this._clearTimeoutTimer();
    try {
      if (this.buffer.length > 0) {
        await this.flush();
      }
      if (this._currentFlush) {
        await this._currentFlush;
      }
      callback();
    } catch (err) {
      callback(err);
    }
  }

  _destroy(err, callback) {
    this._clearTimeoutTimer();
    super._destroy(err, callback);
  }

  /**
   * Flushes the buffered records to MongoDB using high-throughput bulk operations.
   * Serializes consecutive flushes to guarantee order and avoid race conditions.
   */
  async flush() {
    this._clearTimeoutTimer();

    if (this.buffer.length === 0) {
      if (this._currentFlush) {
        await this._currentFlush;
      }
      return;
    }

    const currentBatch = this.buffer;
    this.buffer = []; // Free buffer reference immediately for garbage collection
    this.batchIndex++;

    const batchId = `b_${this.batchIndex}_${Date.now()}`;
    const batchStartTime = Date.now();
    const count = currentBatch.length;
    const currentBatchIndex = this.batchIndex;

    const performFlush = async () => {
      let documents;
      if (typeof this.transformDocument === 'function') {
        documents = currentBatch.map((item, idx) =>
          this.transformDocument(item, {
            fileId: this.fileId,
            batchId,
            batchIndex: currentBatchIndex,
            rowNumber: item.rowNumber !== undefined ? item.rowNumber : (this.totalIngested + idx + 1)
          })
        );
      } else if (this.wrapPayload) {
        documents = currentBatch.map((item, idx) => {
          if (item && item.fileId && item.payload) {
            return {
              fileId: item.fileId,
              batchId: item.batchId || batchId,
              rowNumber: item.rowNumber !== undefined ? item.rowNumber : (this.totalIngested + idx + 1),
              metadata: {
                ...this.metadata,
                ...item.metadata,
                ingestedAt: new Date(),
                batchNumber: currentBatchIndex
              },
              payload: item.payload
            };
          }
          return {
            fileId: this.fileId,
            batchId,
            rowNumber: item.rowNumber !== undefined ? item.rowNumber : (this.totalIngested + idx + 1),
            metadata: {
              ...this.metadata,
              ingestedAt: new Date(),
              batchNumber: currentBatchIndex
            },
            payload: item.payload !== undefined ? item.payload : item
          };
        });
      } else {
        documents = currentBatch.map(item => item.payload !== undefined ? item.payload : item);
      }

      if (this.writeMethod === 'insertMany') {
        // High-speed insertMany with ordered: false
        await this.model.insertMany(documents, { ordered: false, lean: true });
      } else {
        // High-throughput bulkWrite with insertOne operations ({ ordered: false })
        const bulkOps = documents.map(doc => ({
          insertOne: {
            document: doc
          }
        }));
        await this.model.bulkWrite(bulkOps, { ordered: false });
      }

      const durationMs = Date.now() - batchStartTime;
      this.totalIngested += count;
      this.totalFlushedBatches++;

      const stats = {
        batchId,
        batchNumber: currentBatchIndex,
        batchSize: count,
        durationMs,
        totalIngested: this.totalIngested,
        heapUsedMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
        rssMB: +(process.memoryUsage().rss / 1024 / 1024).toFixed(2)
      };

      this.emit('batchFlushed', stats);
      if (typeof this.onBatchFlushed === 'function') {
        this.onBatchFlushed(stats);
      }
    };

    const prev = this._currentFlush || Promise.resolve();
    const next = prev.catch(() => {}).then(performFlush);
    this._currentFlush = next;

    try {
      await next;
    } finally {
      if (this._currentFlush === next) {
        this._currentFlush = null;
      }
    }
  }

  /**
   * Explicitly closes and flushes any trailing records in the buffer.
   */
  async close() {
    this._clearTimeoutTimer();
    if (this.buffer.length > 0) {
      await this.flush();
    }
    if (this._currentFlush) {
      await this._currentFlush;
    }
  }

  getMetrics() {
    const elapsedSec = Math.max((Date.now() - this.startTime) / 1000, 0.001);
    return {
      fileId: this.fileId,
      totalIngested: this.totalIngested,
      totalBatches: this.totalFlushedBatches,
      pendingBuffer: this.buffer.length,
      elapsedSec: +elapsedSec.toFixed(2),
      throughputRowsPerSec: Math.round(this.totalIngested / elapsedSec),
      currentHeapUsedMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
      currentRssMB: +(process.memoryUsage().rss / 1024 / 1024).toFixed(2)
    };
  }

  getStats() {
    return this.getMetrics();
  }
}

/**
 * DLQBuffer:
 * Buffers isolated invalid, rejected, or malformed rows and commits bulk inserts
 * to the DeadLetterQueue (DLQ) collection utilizing bulkWrite({ ordered: false })
 * or insertMany({ ordered: false }).
 *
 * Gathers up to 500 error rows before committing.
 * Includes an automatic flushing mechanism triggered by a timeout threshold (default: 500ms)
 * to clear trailing records at the end of a stream.
 */
class DLQBuffer extends Writable {
  /**
   * @param {object} options
   * @param {import('mongoose').Model} [options.model] - DLQ Mongoose model (default: DeadLetterQueue)
   * @param {string} [options.jobId] - Associated ingestion Job ID
   * @param {string} [options.fileId] - File ID alias
   * @param {number} [options.batchSize=500] - Micro-batch size for errors (default 500)
   * @param {number} [options.flushTimeoutMs=500] - Trailing records timeout threshold in ms (default 500ms)
   * @param {'bulkWrite'|'insertMany'} [options.writeMethod='bulkWrite'] - Bulk insert method
   * @param {function} [options.onBatchFlushed] - Callback after each error batch flush
   * @param {function} [options.formatError] - Custom error transformer
   */
  constructor(options = {}) {
    super({ objectMode: true, highWaterMark: options.highWaterMark || 16 });

    this.model = options.model || options.dlqModel || DeadLetterQueue;
    this.jobId = options.jobId || options.fileId || `job_${crypto.randomUUID()}`;
    this.fileId = options.fileId || this.jobId;
    this.batchSize = options.batchSize || 500;
    this.flushTimeoutMs = options.flushTimeoutMs !== undefined ? options.flushTimeoutMs : 500;
    this.writeMethod = options.writeMethod || 'bulkWrite';
    this.onBatchFlushed = options.onBatchFlushed || null;
    this.formatError = options.formatError || null;

    this.buffer = [];
    this.batchIndex = 0;
    this.totalLoggedErrors = 0;
    this.totalFlushedBatches = 0;
    this.startTime = Date.now();
    this.flushTimer = null;
    this._currentFlush = null;
  }

  _scheduleTimeoutFlush() {
    if (this.flushTimer || !this.flushTimeoutMs || this.flushTimeoutMs <= 0) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this._handleTimeoutFlush();
    }, this.flushTimeoutMs);

    if (this.flushTimer && typeof this.flushTimer.unref === 'function') {
      this.flushTimer.unref();
    }
  }

  _clearTimeoutTimer() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  async _handleTimeoutFlush() {
    this.flushTimer = null;
    if (this.buffer.length > 0) {
      try {
        await this.flush();
      } catch (err) {
        if (typeof this.emit === 'function') {
          this.emit('error', err);
        } else {
          console.error(`[DLQBuffer] Timeout flush error: ${err.message}`);
        }
      }
    }
  }

  /**
   * Push an error record or array of error records to the DLQ buffer.
   * Flushes immediately if batchSize (500) reached; schedules timeout flush otherwise.
   * @param {object|object[]} errorDoc
   */
  async push(errorDoc) {
    if (!errorDoc) return;

    if (Array.isArray(errorDoc)) {
      for (const item of errorDoc) {
        await this.push(item);
      }
      return;
    }

    this.buffer.push(errorDoc);

    if (this.buffer.length >= this.batchSize) {
      this._clearTimeoutTimer();
      await this.flush();
    } else {
      this._scheduleTimeoutFlush();
    }
  }

  /**
   * Writable stream write implementation
   */
  async _write(record, encoding, callback) {
    try {
      await this.push(record);
      callback();
    } catch (err) {
      callback(err);
    }
  }

  /**
   * Stream finalization: automatically flushes trailing errors
   */
  async _final(callback) {
    this._clearTimeoutTimer();
    try {
      if (this.buffer.length > 0) {
        await this.flush();
      }
      if (this._currentFlush) {
        await this._currentFlush;
      }
      callback();
    } catch (err) {
      callback(err);
    }
  }

  _destroy(err, callback) {
    this._clearTimeoutTimer();
    super._destroy(err, callback);
  }

  /**
   * Normalizes error records to ensure valid documents for DeadLetterQueue and UploadError schemas
   */
  _normalizeRecord(err, idx) {
    if (typeof this.formatError === 'function') {
      return this.formatError(err, { jobId: this.jobId, fileId: this.fileId, index: idx });
    }

    const jobId = err.jobId || err.fileId || this.jobId;
    const fileId = err.fileId || err.jobId || this.fileId;
    const rowNumber = typeof err.rowNumber === 'number'
      ? err.rowNumber
      : (this.totalLoggedErrors + idx + 1);

    const rawData = err.rawData !== undefined ? err.rawData : (err.rawRow !== undefined ? err.rawRow : err);
    const rawRow = err.rawRow !== undefined ? err.rawRow : rawData;
    const reason = err.rejectedReason || err.errorMessage || err.error || 'Record rejected by validation';
    const errorType = err.errorType || (err.failedField ? 'VALIDATION_FAILED' : 'MALFORMED_ROW');
    const failedField = err.failedField || (err.details && err.details.failedField) || null;
    const details = err.details || (failedField ? { failedField } : {});
    const timestamp = err.timestamp || err.createdAt || new Date();

    return {
      jobId,
      fileId,
      rowNumber,
      rawData,
      rawRow,
      rejectedReason: reason,
      errorMessage: reason,
      errorType,
      failedField,
      details,
      timestamp,
      createdAt: timestamp
    };
  }

  /**
   * Flush all buffered errors to the DLQ collection via bulkWrite or insertMany.
   */
  async flush() {
    this._clearTimeoutTimer();

    if (this.buffer.length === 0 || !this.model) {
      if (this._currentFlush) {
        await this._currentFlush;
      }
      return;
    }

    const currentBatch = this.buffer;
    this.buffer = [];
    this.batchIndex++;

    const batchStartTime = Date.now();
    const count = currentBatch.length;
    const currentBatchIndex = this.batchIndex;

    const performFlush = async () => {
      const documents = currentBatch.map((err, idx) => this._normalizeRecord(err, idx));

      if (this.writeMethod === 'insertMany') {
        await this.model.insertMany(documents, { ordered: false, lean: true });
      } else {
        const bulkOps = documents.map(doc => ({
          insertOne: { document: doc }
        }));
        await this.model.bulkWrite(bulkOps, { ordered: false });
      }

      this.totalLoggedErrors += count;
      this.totalFlushedBatches++;

      const stats = {
        batchNumber: currentBatchIndex,
        batchSize: count,
        durationMs: Date.now() - batchStartTime,
        totalLoggedErrors: this.totalLoggedErrors
      };

      this.emit('batchFlushed', stats);
      if (typeof this.onBatchFlushed === 'function') {
        this.onBatchFlushed(stats);
      }
    };

    const prev = this._currentFlush || Promise.resolve();
    const next = prev.catch(() => {}).then(performFlush);
    this._currentFlush = next;

    try {
      await next;
    } finally {
      if (this._currentFlush === next) {
        this._currentFlush = null;
      }
    }
  }

  /**
   * Explicitly closes and flushes any trailing errors in the DLQ buffer.
   */
  async close() {
    this._clearTimeoutTimer();
    if (this.buffer.length > 0) {
      await this.flush();
    }
    if (this._currentFlush) {
      await this._currentFlush;
    }
  }

  getStats() {
    const elapsedSec = Math.max((Date.now() - this.startTime) / 1000, 0.001);
    return {
      jobId: this.jobId,
      fileId: this.fileId,
      totalLoggedErrors: this.totalLoggedErrors,
      totalBatches: this.totalFlushedBatches,
      pendingBuffer: this.buffer.length,
      elapsedSec: +elapsedSec.toFixed(2)
    };
  }

  getMetrics() {
    return this.getStats();
  }
}

module.exports = {
  DestinationBuffer,
  DLQBuffer,
  MongoBatchIngestionStream: DestinationBuffer,
  IsolatedErrorBatcher: DLQBuffer
};
