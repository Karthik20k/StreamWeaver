const fs = require('node:fs');
const { pipeline } = require('node:stream/promises');
const crypto = require('node:crypto');
const StagingData = require('../models/StagingData');
const UploadError = require('../models/UploadError');
const DeadLetterQueue = require('../models/DeadLetterQueue');
const { createCsvParserStream, RowValidationTransform } = require('../streams/csvParserStream');
const { DestinationBuffer, DLQBuffer } = require('../streams/batchIngestionStream');

/**
 * Execute the complete streaming ingestion pipeline with separate DestinationBuffer and DLQBuffer sinks.
 *
 * @param {object} options
 * @param {import('stream').Readable|string} options.source - Readable stream OR string file path
 * @param {string} [options.fileId] - Unique file identifier (auto-generated if omitted)
 * @param {string} [options.fileName] - Original file name
 * @param {number} [options.batchSize=1000] - Micro-batching threshold for DestinationBuffer
 * @param {number} [options.dlqBatchSize=500] - Micro-batching threshold for DLQBuffer
 * @param {number} [options.flushTimeoutMs=500] - Inactivity / trailing record flush timeout (ms)
 * @param {'bulkWrite'|'insertMany'} [options.writeMethod='bulkWrite'] - MongoDB bulk insertion method
 * @param {import('mongoose').Model} [options.stagingModel=StagingData] - Destination Mongoose model
 * @param {import('mongoose').Model} [options.errorModel=UploadError] - Mongoose upload error model
 * @param {import('mongoose').Model} [options.dlqModel] - Optional direct DLQ Mongoose model
 * @param {function} [options.rowValidator] - Optional custom row validator function
 * @param {function} [options.onProgress] - Progress event callback
 * @param {function} [options.onBatch] - Batch completion event callback
 * @param {object} [options.metadata={}] - Custom metadata stored with ingested documents
 * @returns {Promise<object>} Ingestion summary metrics
 */
async function processCsvIngestion(options = {}) {
  const {
    source,
    fileId = `file_${crypto.randomUUID()}`,
    fileName = 'unknown_source.csv',
    batchSize = 1000,
    dlqBatchSize = 500,
    flushTimeoutMs = 500,
    writeMethod = 'bulkWrite',
    stagingModel = StagingData,
    errorModel = UploadError,
    dlqModel = null,
    rowValidator = null,
    onProgress = null,
    onBatch = null,
    metadata = {}
  } = options;

  if (!source) {
    throw new Error('[IngestionWorker] Source readable stream or file path must be provided.');
  }

  // 1. Establish ReadableStream
  let readableStream;
  let shouldCloseFd = false;

  if (typeof source === 'string') {
    if (!fs.existsSync(source)) {
      throw new Error(`[IngestionWorker] File path does not exist: ${source}`);
    }
    // High-water mark configured for streaming chunk efficiency
    readableStream = fs.createReadStream(source, { highWaterMark: 64 * 1024 });
    shouldCloseFd = true;
  } else if (typeof source.pipe === 'function' || typeof source[Symbol.asyncIterator] === 'function') {
    readableStream = source;
  } else {
    throw new Error('[IngestionWorker] Invalid source: must be a readable stream or file path.');
  }

  const startTime = Date.now();
  let headersDetected = [];

  // 2. Initialize DLQ Buffer for isolated errors
  const activeDlqModel = dlqModel || errorModel || DeadLetterQueue;
  const errorBatcher = new DLQBuffer({
    model: activeDlqModel,
    jobId: fileId,
    fileId,
    batchSize: Math.min(dlqBatchSize, 500),
    flushTimeoutMs,
    writeMethod
  });

  // 3. Initialize CSV Parser
  const csvParser = createCsvParserStream();

  // 4. Initialize Row Validator & Error Isolation Transform
  const validatorTransform = new RowValidationTransform({
    fileId,
    rowValidator,
    onErrorRow: async (errorDoc) => {
      await errorBatcher.push(errorDoc);
    }
  });

  // Capture headers when emitted by parser
  csvParser.on('headers', (headers) => {
    headersDetected = headers;
    validatorTransform.setHeaders(headers);
  });

  // 5. Initialize Destination Buffer for clean records
  const batchIngestionStream = new DestinationBuffer({
    model: stagingModel,
    fileId,
    batchSize,
    flushTimeoutMs,
    writeMethod,
    metadata: {
      sourceFileName: fileName,
      ...metadata
    },
    onBatchFlushed: (batchStats) => {
      const vStats = validatorTransform.getStats();
      const currentStats = {
        fileId,
        ...batchStats,
        validRows: vStats.validRows,
        invalidRows: vStats.invalidRows,
        totalParsed: vStats.totalRows
      };

      if (typeof onBatch === 'function') {
        onBatch(currentStats);
      }
      if (typeof onProgress === 'function') {
        onProgress(currentStats);
      }
    }
  });

  try {
    // 6. Execute Modular Node.js Pipeline with Native Backpressure
    await pipeline(
      readableStream,
      csvParser,
      validatorTransform,
      batchIngestionStream
    );

    // 7. Flush and close any remaining isolated errors in DLQBuffer
    await errorBatcher.close();

    const durationMs = Date.now() - startTime;
    const durationSec = Math.max(durationMs / 1000, 0.001);
    const finalValidatorStats = validatorTransform.getStats();
    const finalBatchStats = batchIngestionStream.getMetrics();
    const finalErrorStats = errorBatcher.getStats();

    const memUsage = process.memoryUsage();

    return {
      success: true,
      fileId,
      fileName,
      headers: headersDetected,
      totalRows: finalValidatorStats.totalRows,
      validRows: finalValidatorStats.validRows,
      invalidRows: finalValidatorStats.invalidRows,
      ingestedBatches: finalBatchStats.totalBatches,
      loggedErrors: finalErrorStats.totalLoggedErrors,
      durationMs,
      durationSec: +durationSec.toFixed(2),
      throughputRowsPerSec: Math.round(finalValidatorStats.totalRows / durationSec),
      memoryTelemetry: {
        heapUsedMB: +(memUsage.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMB: +(memUsage.heapTotal / 1024 / 1024).toFixed(2),
        rssMB: +(memUsage.rss / 1024 / 1024).toFixed(2),
        externalMB: +(memUsage.external / 1024 / 1024).toFixed(2)
      }
    };
  } catch (error) {
    // Pipeline error handling
    console.error(`[IngestionWorker] Pipeline error for file ${fileId}:`, error);
    throw error;
  } finally {
    if (shouldCloseFd && readableStream && !readableStream.destroyed) {
      readableStream.destroy();
    }
  }
}

module.exports = {
  processCsvIngestion
};
