'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// In-memory store for ingestion jobs (mirrors Dev 2 Mongoose IngestionJob model)
const jobsStore = new Map();

function generateErrorRecord(jobId, rowNumber, index) {
  const fields = ['unitPrice', 'timestamp', 'quantity', 'email', 'orderId'];
  const field = fields[index % fields.length];
  let reason = '';
  let rawData = {};

  switch (field) {
    case 'unitPrice':
      reason = 'Cast failure: String "$49.99 USD" cannot be converted to Number';
      rawData = { order_id: `ORD-${1000 + rowNumber}`, customer_id: `CUST-${500 + index}`, unit_price: '$49.99 USD', quantity: '2' };
      break;
    case 'timestamp':
      reason = 'Date parse failure: Value "invalid-date-2026" does not match ISO-8601';
      rawData = { order_id: `ORD-${1000 + rowNumber}`, timestamp: 'invalid-date-2026', status: 'PENDING' };
      break;
    case 'quantity':
      reason = 'Range constraint violation: Quantity -5 is below minimum allowed value 1';
      rawData = { order_id: `ORD-${1000 + rowNumber}`, quantity: '-5', unit_price: '19.99' };
      break;
    case 'email':
      reason = 'Regex validation failure: "user_at_domain" missing valid domain format';
      rawData = { customer_id: `CUST-${500 + index}`, email: 'user_at_domain', full_name: 'John Doe' };
      break;
    default:
      reason = 'Required target field constraint: field "orderId" is null or undefined';
      rawData = { customer_id: `CUST-${500 + index}`, unit_price: '10.50' };
  }

  return {
    id: `dlq-${jobId}-${rowNumber}`,
    jobId,
    rowNumber,
    failedField: field,
    rejectedReason: reason,
    rawData,
    timestamp: new Date(Date.now() - (index * 12000)).toISOString()
  };
}

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
    errors: [],
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
        job.errorCount += 1;
        const errObj = {
          id: `dlq-${job.jobId}-${job.totalRowsProcessed}`,
          jobId: job.jobId,
          rowNumber: job.totalRowsProcessed,
          failedField: tick % 8 === 0 ? 'timestamp' : 'unitPrice',
          rejectedReason: tick % 8 === 0 ? 'Invalid ISO-8601 date string' : 'Non-numeric currency symbol parse failure',
          rawData: {
            order_id: `ORD-${job.totalRowsProcessed}`,
            customer_id: `CUST-${(job.totalRowsProcessed % 200) + 100}`,
            unit_price: tick % 8 === 0 ? '19.99' : '$49.99 USD',
            timestamp: tick % 8 === 0 ? 'invalid-date-2026' : '2026-09-27T10:00:00Z',
            quantity: '3',
            status: 'PENDING'
          },
          timestamp: new Date().toISOString()
        };
        job.recentErrors.push(errObj);
        job.errors.push(errObj);
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

/**
 * GET /api/jobs/:id/errors
 * Paginated error retrieval route (Dev 2 Day 5 & Dev 3 Day 5 integration)
 */
router.get('/:id/errors', (req, res) => {
  const { id } = req.params;
  let job = jobsStore.get(id);

  if (!job) {
    job = createJob({ id });
  }

  // Ensure errors array is populated if job has errors or for demonstration
  if (!job.errors || job.errors.length === 0) {
    job.errors = [];
    const countToGenerate = job.errorCount > 0 ? job.errorCount : 18;
    for (let i = 1; i <= countToGenerate; i++) {
      job.errors.push(generateErrorRecord(id, i * 47 + 12, i));
    }
    job.errorCount = job.errors.length;
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
  const fieldFilter = req.query.field ? String(req.query.field).trim().toLowerCase() : null;
  const searchFilter = req.query.search ? String(req.query.search).trim().toLowerCase() : null;

  let filteredErrors = [...job.errors];

  if (fieldFilter && fieldFilter !== 'all') {
    filteredErrors = filteredErrors.filter(err => 
      (err.failedField || '').toLowerCase() === fieldFilter
    );
  }

  if (searchFilter) {
    filteredErrors = filteredErrors.filter(err =>
      (err.rejectedReason || '').toLowerCase().includes(searchFilter) ||
      (err.failedField || '').toLowerCase().includes(searchFilter) ||
      String(err.rowNumber).includes(searchFilter) ||
      JSON.stringify(err.rawData || {}).toLowerCase().includes(searchFilter)
    );
  }

  const totalErrors = filteredErrors.length;
  const totalPages = Math.ceil(totalErrors / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginatedErrors = filteredErrors.slice(startIndex, startIndex + limit);

  const distinctFailedFields = [...new Set(job.errors.map(e => e.failedField).filter(Boolean))];

  return res.status(200).json({
    success: true,
    jobId: id,
    page,
    limit,
    totalErrors,
    totalPages,
    errors: paginatedErrors,
    distinctFailedFields
  });
});

/**
 * DELETE /api/jobs/:id/errors
 * Purge / cleanup DLQ records for a job (Dev 2 Day 5 cleanup routine)
 */
router.delete('/:id/errors', (req, res) => {
  const { id } = req.params;
  const job = jobsStore.get(id);

  if (job) {
    job.errors = [];
    job.recentErrors = [];
    job.errorCount = 0;
  }

  return res.status(200).json({
    success: true,
    message: `DLQ records for job ${id} successfully cleared.`
  });
});

/**
 * GET /api/jobs/:id/errors/export
 * Streaming Error Log Export Endpoint (Dev 2 Day 15 Streaming Export Deliverable)
 * Streams failed DLQ records directly to client as a downloadable CSV.
 */
router.get('/:id/errors/export', (req, res) => {
  const { id } = req.params;
  let job = jobsStore.get(id);

  if (!job) {
    job = createJob({ id });
  }

  if (!job.errors || job.errors.length === 0) {
    job.errors = [];
    const countToGenerate = job.errorCount > 0 ? job.errorCount : 18;
    for (let i = 1; i <= countToGenerate; i++) {
      job.errors.push(generateErrorRecord(id, i * 47 + 12, i));
    }
    job.errorCount = job.errors.length;
  }

  const filename = `job-${id}-failed-records.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Transfer-Encoding', 'chunked');

  // CSV Header
  res.write('LineNumber,FailedColumn,ErrorCategory,ExecutionTimeMs,ExceptionMessage,Timestamp,RawPayload\r\n');

  // Stream each failed record as CSV row
  for (const err of job.errors) {
    const lineNum = err.rowNumber || err.lineNumber || 0;
    const failedCol = (err.failedField || err.failedColumn || 'unknown').replace(/"/g, '""');
    const category = (err.errorCategory || 'VALIDATION_THROW').replace(/"/g, '""');
    const latency = err.executionTimeMs || 12;
    const msg = (err.rejectedReason || err.scriptError || '').replace(/"/g, '""');
    const ts = (err.timestamp || new Date().toISOString()).replace(/"/g, '""');
    const raw = JSON.stringify(err.rawData || err.rawRow || {}).replace(/"/g, '""');

    res.write(`${lineNum},"${failedCol}","${category}",${latency},"${msg}","${ts}","${raw}"\r\n`);
  }

  res.end();
});

module.exports = {
  router,
  jobsStore,
  createJob
};
