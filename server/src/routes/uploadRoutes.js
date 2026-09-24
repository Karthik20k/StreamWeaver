const express = require('express');
const busboy = require('busboy');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { processCsvIngestion } = require('../pipeline/ingestionWorker');
const StagingData = require('../models/StagingData');
const UploadError = require('../models/UploadError');

const router = express.Router();

// In-memory active job tracker for monitoring progress
const activeJobs = new Map();

/**
 * POST /api/upload/stream
 * Direct streaming upload: hooks into multipart busboy stream directly
 * and pipes incoming file stream to the batch ingestion pipeline.
 */
router.post('/stream', (req, res) => {
  const bb = busboy({ headers: req.headers });
  let pipelinePromise = null;
  let fileHandled = false;
  const fileId = req.query.fileId || `upload_${crypto.randomUUID()}`;

  bb.on('file', (name, fileStream, info) => {
    if (fileHandled) {
      fileStream.resume(); // Drain any subsequent files if multiple sent
      return;
    }
    fileHandled = true;
    const { filename } = info;

    activeJobs.set(fileId, {
      fileId,
      fileName: filename,
      status: 'processing',
      startedAt: new Date(),
      totalIngested: 0,
      errorsCount: 0
    });

    pipelinePromise = processCsvIngestion({
      source: fileStream,
      fileId,
      fileName: filename,
      batchSize: parseInt(req.query.batchSize, 10) || 1000,
      writeMethod: req.query.writeMethod || 'bulkWrite',
      onBatch: (stats) => {
        const job = activeJobs.get(fileId);
        if (job) {
          job.totalIngested = stats.totalIngested;
          job.errorsCount = stats.invalidRows;
          job.lastBatch = stats;
        }
      }
    });
  });

  bb.on('close', async () => {
    if (!fileHandled || !pipelinePromise) {
      return res.status(400).json({ error: 'No file provided in multipart stream.' });
    }

    try {
      const summary = await pipelinePromise;
      activeJobs.set(fileId, {
        ...activeJobs.get(fileId),
        status: 'completed',
        summary
      });

      return res.status(200).json({
        message: 'Streaming ingestion completed successfully.',
        summary
      });
    } catch (err) {
      activeJobs.set(fileId, {
        ...activeJobs.get(fileId),
        status: 'failed',
        error: err.message
      });
      return res.status(500).json({
        error: 'Streaming pipeline execution failed.',
        details: err.message
      });
    }
  });

  bb.on('error', (err) => {
    console.error('[UploadRoutes] Busboy error:', err);
    res.status(500).json({ error: 'Upload streaming error: ' + err.message });
  });

  req.pipe(bb);
});

/**
 * POST /api/upload/process-temp
 * Dev 1 hook: When Dev 1 streams the file to a temp file on disk first,
 * this endpoint triggers asynchronous worker processing on that temp file.
 */
router.post('/process-temp', async (req, res) => {
  const { tempFilePath, fileName, batchSize, writeMethod } = req.body;

  if (!tempFilePath) {
    return res.status(400).json({ error: 'tempFilePath is required.' });
  }

  const fileId = req.body.fileId || `temp_${crypto.randomUUID()}`;

  // Run asynchronously without blocking response
  activeJobs.set(fileId, {
    fileId,
    fileName: fileName || path.basename(tempFilePath),
    tempFilePath,
    status: 'processing',
    startedAt: new Date(),
    totalIngested: 0,
    errorsCount: 0
  });

  // Respond immediately with job ID
  res.status(202).json({
    message: 'Asynchronous ingestion job started.',
    fileId,
    status: 'processing'
  });

  // Execute in background
  try {
    const summary = await processCsvIngestion({
      source: tempFilePath,
      fileId,
      fileName: fileName || path.basename(tempFilePath),
      batchSize: batchSize || 1000,
      writeMethod: writeMethod || 'bulkWrite',
      onBatch: (stats) => {
        const job = activeJobs.get(fileId);
        if (job) {
          job.totalIngested = stats.totalIngested;
          job.errorsCount = stats.invalidRows;
          job.lastBatch = stats;
        }
      }
    });

    activeJobs.set(fileId, {
      ...activeJobs.get(fileId),
      status: 'completed',
      completedAt: new Date(),
      summary
    });
  } catch (err) {
    activeJobs.set(fileId, {
      ...activeJobs.get(fileId),
      status: 'failed',
      failedAt: new Date(),
      error: err.message
    });
  }
});

/**
 * GET /api/upload/status/:fileId
 * Check ingestion telemetry, status, and summary for a given file
 */
router.get('/status/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const inMemoryJob = activeJobs.get(fileId);

  // Also query MongoDB for confirmed persisted counts
  try {
    const stagingCount = await StagingData.countDocuments({ fileId });
    const errorCount = await UploadError.countDocuments({ fileId });

    res.status(200).json({
      fileId,
      job: inMemoryJob || null,
      dbRecords: {
        stagedDocuments: stagingCount,
        isolatedErrors: errorCount
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/upload/errors/:fileId
 * Retrieve isolated error records for inspection
 */
router.get('/errors/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

  try {
    const errors = await UploadError.find({ fileId })
      .sort({ rowNumber: 1 })
      .limit(limit)
      .lean();

    const total = await UploadError.countDocuments({ fileId });

    res.status(200).json({
      fileId,
      totalErrors: total,
      returned: errors.length,
      errors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
