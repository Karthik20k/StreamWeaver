'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// In-memory store for ingestion jobs (mirrors Dev 2 Mongoose IngestionJob model)
const jobsStore = new Map();

/**
 * Creates or retrieves an ingestion job
 */
function createJob({ id, fileName, targetCollection, totalBytes, estimatedRows, mappingConfig }) {
  const jobId = id || crypto.randomUUID();
  const job = {
    jobId,
    fileName: fileName || 'dataset.csv',
    targetCollection: targetCollection || 'ecommerce_orders',
    status: 'processing', // 'initializing' | 'processing' | 'completed' | 'failed' | 'aborted'
    totalBytes: totalBytes || 1024 * 1024,
    bytesProcessed: 0,
    estimatedRows: estimatedRows || 50000,
    totalRowsProcessed: 0,
    errorCount: 0,
    processingRate: 0, // rows/sec
    batchesCommitted: 0,
    mappingConfig: mappingConfig || {},
    recentErrors: [],
    logs: [
      `[Pipeline] Initializing streaming ingestion for job ${jobId}`,
      `[Pipeline] Target MongoDB collection: ${targetCollection || 'ecommerce_orders'}`,
      `[Pipeline] Connected to transform stream with mapping rules`
    ],
    createdAt: new Date().toISOString(),
    completedAt: null
  };

  jobsStore.set(jobId, job);
  return job;
}

/**
 * POST /api/jobs
 * Initialize an ingestion job
 */
router.post('/', (req, res) => {
  const { fileName, targetCollection, totalBytes, estimatedRows, mappingConfig } = req.body || {};
  const job = createJob({
    fileName,
    targetCollection,
    totalBytes,
    estimatedRows,
    mappingConfig
  });

  return res.status(201).json({
    success: true,
    job
  });
});

/**
 * GET /api/jobs/:id
 * Retrieve job status snapshot
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const job = jobsStore.get(id);

  if (!job) {
    // If not found, return an auto-initialized mock job for seamless dev experience
    const mock = createJob({ id });
    return res.status(200).json({ success: true, job: mock });
  }

  return res.status(200).json({
    success: true,
    job
  });
});

/**
 * GET /api/jobs/:id/progress
 * Lightweight polling route reporting live telemetry (Dev 2 Day 4 task)
 */
router.get('/:id/progress', (req, res) => {
  const { id } = req.params;
  let job = jobsStore.get(id);

  if (!job) {
    job = createJob({ id });
  }

  const percent = job.estimatedRows > 0 
    ? Math.min(100, Math.round((job.totalRowsProcessed / job.estimatedRows) * 100))
    : 0;

  return res.status(200).json({
    jobId: job.jobId,
    status: job.status,
    totalRowsProcessed: job.totalRowsProcessed,
    estimatedRows: job.estimatedRows,
    errorCount: job.errorCount,
    processingRate: job.processingRate,
    batchesCommitted: job.batchesCommitted,
    percent,
    bytesProcessed: job.bytesProcessed,
    totalBytes: job.totalBytes,
    recentErrors: job.recentErrors.slice(-5)
  });
});

/**
 * GET /api/jobs/:id/events
 * Server-Sent Events (SSE) live telemetry stream (Dev 2 Day 4 task)
 */
router.get('/:id/events', (req, res) => {
  const { id } = req.params;
  let job = jobsStore.get(id);

  if (!job) {
    job = createJob({ id });
  }

  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', job })}\n\n`);

  // Simulate or stream high-throughput micro-batch telemetry
  const intervalMs = 180;
  const rowsPerTick = Math.max(800, Math.floor(job.estimatedRows / 35));
  let tick = 0;

  const timer = setInterval(() => {
    tick++;
    if (job.status === 'processing') {
      const addedRows = Math.min(rowsPerTick, job.estimatedRows - job.totalRowsProcessed);
      job.totalRowsProcessed += addedRows;

      // Rate calculation (approx 20,000 - 35,000 rows/sec)
      job.processingRate = Math.round((addedRows / (intervalMs / 1000)) + (Math.random() * 2000 - 1000));
      job.batchesCommitted = Math.floor(job.totalRowsProcessed / 1000);

      // Occasional bad rows simulated for DLQ error isolation
      if (tick % 4 === 0 && job.errorCount < Math.max(3, Math.floor(job.estimatedRows * 0.003))) {
        job.errorCount += 1 + Math.floor(Math.random() * 2);
        const errObj = {
          rowNumber: job.totalRowsProcessed,
          failedField: tick % 8 === 0 ? 'timestamp' : 'unitPrice',
          rejectedReason: tick % 8 === 0 ? 'Invalid ISO-8601 date string' : 'Non-numeric currency symbol parse failure',
          timestamp: new Date().toISOString()
        };
        job.recentErrors.push(errObj);
        job.logs.push(`[DLQ Sink] Isolated invalid row #${errObj.rowNumber} -> ${errObj.failedField}: ${errObj.rejectedReason}`);
      }

      if (tick % 3 === 0) {
        job.logs.push(`[MongoDB Sink] Committed bulkWrite micro-batch #${job.batchesCommitted} (${job.totalRowsProcessed.toLocaleString()} clean rows)`);
      }

      const percent = Math.min(100, Math.round((job.totalRowsProcessed / job.estimatedRows) * 100));

      if (job.totalRowsProcessed >= job.estimatedRows) {
        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        job.logs.push(`[Pipeline] Streaming ingestion completed. ${job.totalRowsProcessed.toLocaleString()} rows ingested, ${job.errorCount} sent to DLQ.`);
      }

      const payload = {
        type: 'PROGRESS',
        jobId: job.jobId,
        status: job.status,
        totalRowsProcessed: job.totalRowsProcessed,
        estimatedRows: job.estimatedRows,
        errorCount: job.errorCount,
        processingRate: job.processingRate,
        batchesCommitted: job.batchesCommitted,
        percent,
        recentErrors: job.recentErrors.slice(-5),
        latestLog: job.logs[job.logs.length - 1],
        timestamp: new Date().toISOString()
      };

      res.write(`data: ${JSON.stringify(payload)}\n\n`);

      if (job.status === 'completed') {
        res.write(`data: ${JSON.stringify({ type: 'COMPLETE', job })}\n\n`);
        clearInterval(timer);
        res.end();
      }
    }
  }, intervalMs);

  req.on('close', () => {
    clearInterval(timer);
  });
});

module.exports = {
  router,
  jobsStore,
  createJob
};
