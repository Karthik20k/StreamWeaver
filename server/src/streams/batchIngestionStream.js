const { Writable } = require('node:stream');
const crypto = require('node:crypto');

/**
 * MongoBatchIngestionStream:
 * High-performance Writable Stream implementing micro-batching for MongoDB.
 * Buffers incoming objects into micro-batches (default 1,000 documents) and flushes them
 * via bulkWrite() or insertMany({ ordered: false }).
 *
 * Implements strict backpressure: the stream's callback is paused while the database
 * write is in flight, keeping memory usage constant and preventing heap overflow.
 */
class MongoBatchIngestionStream extends Writable {
  /**
   * @param {object} options
   * @param {import('mongoose').Model} options.model - Target Mongoose Model (e.g. StagingData)
   * @param {string} options.fileId - Unique file ingestion identifier
   * @param {number} [options.batchSize=1000] - Micro-batch threshold (default 1,000)
   * @param {'bulkWrite'|'insertMany'} [options.writeMethod='bulkWrite'] - MongoDB ingestion method
   * @param {object} [options.metadata={}] - Metadata attached to each document
   * @param {function} [options.onBatchFlushed] - Callback after each batch flush (batchStats)
   */
  constructor(options = {}) {
    super({ objectMode: true, highWaterMark: options.highWaterMark || 16 });

    if (!options.model) {
      throw new Error('[MongoBatchIngestionStream] A target mongoose model must be provided.');
    }

    this.model = options.model;
    this.fileId = options.fileId || `file_${crypto.randomUUID()}`;
    this.batchSize = options.batchSize || 1000;
    this.writeMethod = options.writeMethod || 'bulkWrite';
    this.metadata = options.metadata || {};
    this.onBatchFlushed = options.onBatchFlushed || null;

    this.buffer = [];
    this.batchIndex = 0;
    this.totalIngested = 0;
    this.totalFlushedBatches = 0;
    this.startTime = Date.now();
  }

  /**
   * Ingestion write step with micro-batching and backpressure
   */
  async _write(record, encoding, callback) {
    this.buffer.push(record);

    if (this.buffer.length >= this.batchSize) {
      try {
        await this._flushCurrentBatch();
        callback();
      } catch (err) {
        callback(err);
      }
    } else {
      // Buffer not full yet, immediately request next chunk
      callback();
    }
  }

  /**
   * Called automatically when the upstream stream has ended.
   * Flushes any remaining records in the buffer.
   */
  async _final(callback) {
    try {
      if (this.buffer.length > 0) {
        await this._flushCurrentBatch();
      }
      callback();
    } catch (err) {
      callback(err);
    }
  }

  /**
   * Flushes the buffered records to MongoDB using high-throughput bulk operations.
   */
  async _flushCurrentBatch() {
    if (this.buffer.length === 0) return;

    const currentBatch = this.buffer;
    this.buffer = []; // Free buffer reference immediately for garbage collection
    this.batchIndex++;

    const batchId = `b_${this.batchIndex}_${Date.now()}`;
    const batchStartTime = Date.now();
    const count = currentBatch.length;

    // Transform raw record objects to StagingData documents
    const documents = currentBatch.map(item => ({
      fileId: this.fileId,
      batchId,
      rowNumber: item.rowNumber,
      metadata: {
        ...this.metadata,
        ingestedAt: new Date(),
        batchNumber: this.batchIndex
      },
      payload: item.payload || item
    }));

    if (this.writeMethod === 'insertMany') {
      // High-speed insertMany with ordered: false to continue on any duplicate keys
      await this.model.insertMany(documents, { ordered: false, lean: true });
    } else {
      // High-throughput bulkWrite with insertOne operations
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
      batchNumber: this.batchIndex,
      batchSize: count,
      durationMs,
      totalIngested: this.totalIngested,
      heapUsedMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
      rssMB: +(process.memoryUsage().rss / 1024 / 1024).toFixed(2)
    };

    if (typeof this.onBatchFlushed === 'function') {
      this.onBatchFlushed(stats);
    }
  }

  getMetrics() {
    const elapsedSec = Math.max((Date.now() - this.startTime) / 1000, 0.001);
    return {
      fileId: this.fileId,
      totalIngested: this.totalIngested,
      totalBatches: this.totalFlushedBatches,
      elapsedSec: +elapsedSec.toFixed(2),
      throughputRowsPerSec: Math.round(this.totalIngested / elapsedSec),
      currentHeapUsedMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
      currentRssMB: +(process.memoryUsage().rss / 1024 / 1024).toFixed(2)
    };
  }
}

/**
 * IsolatedErrorBatcher:
 * Buffers isolated invalid rows and flushes them to the UploadError collection in micro-batches
 * without holding the main stream or creating documents one-by-one.
 */
class IsolatedErrorBatcher {
  /**
   * @param {object} options
   * @param {import('mongoose').Model} options.model - UploadError Mongoose model
   * @param {string} options.fileId - File ID
   * @param {number} [options.batchSize=500] - Micro-batch size for errors
   */
  constructor(options = {}) {
    this.model = options.model;
    this.fileId = options.fileId || `file_${crypto.randomUUID()}`;
    this.batchSize = options.batchSize || 500;
    this.buffer = [];
    this.totalLoggedErrors = 0;
    this.isFlushing = false;
  }

  /**
   * Push an error record to the batch buffer. Flushes if threshold reached.
   * @param {object} errorDoc
   */
  async push(errorDoc) {
    this.buffer.push(errorDoc);
    if (this.buffer.length >= this.batchSize && !this.isFlushing) {
      await this.flush();
    }
  }

  /**
   * Flush all buffered errors to the UploadError collection via bulkWrite or insertMany.
   */
  async flush() {
    if (this.buffer.length === 0 || !this.model) return;

    this.isFlushing = true;
    const batch = this.buffer;
    this.buffer = [];

    try {
      const ops = batch.map(err => ({
        insertOne: { document: err }
      }));
      await this.model.bulkWrite(ops, { ordered: false });
      this.totalLoggedErrors += batch.length;
    } catch (writeErr) {
      console.error(`[IsolatedErrorBatcher] Failed to flush error batch: ${writeErr.message}`);
    } finally {
      this.isFlushing = false;
    }
  }

  getStats() {
    return {
      totalLoggedErrors: this.totalLoggedErrors + this.buffer.length,
      pendingBuffer: this.buffer.length
    };
  }
}

module.exports = {
  MongoBatchIngestionStream,
  IsolatedErrorBatcher
};
