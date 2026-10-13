/**
 * jobRoutes.js
 *
 * Live Telemetry, Error Auditing, and Job Cleanup routes for StreamWeaver ingestion jobs.
 *
 * Routes exposed:
 *   GET  /api/jobs/:id/events         - Server-Sent Events (SSE) live telemetry stream
 *   GET  /api/jobs/:id/progress       - Lightweight polling snapshot of real-time metrics
 *   GET  /api/jobs/:id/errors/export  - Streaming CSV export of DLQ rows via database cursor
 *   GET  /api/jobs/:id/errors         - Paginated fetch of rejected rows from DLQ + UploadError
 *   POST /api/jobs/:id/cancel         - Soft-cancel an in-flight or partial job
 *   POST /api/jobs/cleanup            - Trigger cleanup routine for aborted / failed jobs
 *   GET  /api/jobs                    - List all jobs with optional status filter
 *   GET  /api/jobs/:id                - Fetch a single job record
 */

'use strict';

const express = require('express');
const { Transform, pipeline } = require('node:stream');
const IngestionJob = require('../models/IngestionJob');
const DeadLetterQueue = require('../models/DeadLetterQueue');
const UploadError = require('../models/UploadError');
const StagingData = require('../models/StagingData');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely escape values for standard RFC 4180 CSV output.
 * Handles objects, strings with commas/quotes/newlines, and null/undefined values.
 */
function escapeCsvValue(val) {
  if (val === null || val === undefined) return '';
  let str;
  if (typeof val === 'object') {
    try {
      str = JSON.stringify(val);
    } catch {
      str = String(val);
    }
  } else {
    str = String(val);
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Escapes characters with special regex meaning.
 */
function escapeRegex(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Transform stream that serializes streaming DLQ document objects into CSV rows.
 * Implements chunk-by-chunk serialization with zero memory buffering.
 */
class DLQToCsvStream extends Transform {
  constructor(columns) {
    super({ objectMode: true });
    this.columns = columns && columns.length > 0
      ? columns
      : ['jobId', 'rowNumber', 'errorType', 'failedField', 'rejectedReason', 'rawData', 'details', 'timestamp'];
    this.headerWritten = false;
  }

  _transform(doc, encoding, callback) {
    try {
      if (!this.headerWritten) {
        this.push(this.columns.map(escapeCsvValue).join(',') + '\r\n');
        this.headerWritten = true;
      }
      const line = this.columns.map((col) => {
        let val;
        if (col === 'timestamp') {
          val = doc.timestamp
            ? new Date(doc.timestamp).toISOString()
            : doc.createdAt
            ? new Date(doc.createdAt).toISOString()
            : '';
        } else if (col === 'rejectedReason') {
          val = doc.rejectedReason ?? doc.errorMessage ?? '';
        } else if (col === 'rawData') {
          val = doc.rawData ?? doc.rawRow ?? '';
        } else {
          val = doc[col] ?? '';
        }
        return escapeCsvValue(val);
      });
      this.push(line.join(',') + '\r\n');
      callback();
    } catch (err) {
      callback(err);
    }
  }

  _flush(callback) {
    if (!this.headerWritten) {
      // For an empty result set, still write the CSV headers
      this.push(this.columns.map(escapeCsvValue).join(',') + '\r\n');
      this.headerWritten = true;
    }
    callback();
  }
}

/**
 * Build a unified progress snapshot object from an IngestionJob document.
 * This is the shape emitted by both the SSE stream and the polling endpoint.
 *
 * @param {object} job - lean or Mongoose IngestionJob document
 * @returns {object}
 */
function buildProgressSnapshot(job) {
  const now = Date.now();
  const elapsedMs = job.startedAt ? now - new Date(job.startedAt).getTime() : 0;
  const elapsedSec = Math.max(elapsedMs / 1000, 0.001);

  // Overall average throughput since startedAt
  const avgThroughput =
    job.status === 'completed'
      ? (job.throughputRowsPerSec ?? 0)
      : +(( job.totalRowsProcessed ?? 0) / elapsedSec).toFixed(2);

  return {
    jobId: job.jobId,
    status: job.status,
    fileName: job.fileName,
    totalRowsProcessed: job.totalRowsProcessed ?? 0,
    validRows: job.validRows ?? 0,
    errorCount: job.errorCount ?? 0,
    // Live rolling rate (rows in last batch window / window duration)
    currentRateRowsPerSec: job.currentRateRowsPerSec ?? 0,
    // Average throughput over full job lifetime
    avgThroughputRowsPerSec: avgThroughput,
    elapsedMs,
    startedAt: job.startedAt ?? null,
    lastProgressAt: job.lastProgressAt ?? null,
    completedAt: job.completedAt ?? null,
    durationMs: job.durationMs ??
      (job.completedAt && job.startedAt
        ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
        : null),
    errorMessage: job.errorMessage ?? null,
    timestamp: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

/** Send a single SSE frame to a response object. */
function sendSSEEvent(res, eventName, data) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** Flush if the underlying socket supports it (e.g. compression middleware). */
function flushSSE(res) {
  if (typeof res.flush === 'function') {
    res.flush();
  }
}

// ---------------------------------------------------------------------------
// GET /api/jobs
// List all ingestion jobs with optional ?status= filter and pagination.
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) {
      filter.status = status;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const skip = (pageNum - 1) * limitNum;

    const [jobs, total] = await Promise.all([
      IngestionJob.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      IngestionJob.countDocuments(filter)
    ]);

    res.status(200).json({
      jobs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/jobs/cleanup  (must be registered BEFORE /:id to avoid collision)
// Cleanup routine: archives or drops records for partial / failed / cancelled
// jobs whose streams were aborted mid-way.
//
// Body params:
//   olderThanMinutes  - only clean up jobs older than N minutes (default: 60)
//   statuses          - array or CSV of statuses to clean
//                       (default: ['failed','cancelled'])
//   dryRun            - report-only, no writes (default: false)
//   hardDelete        - permanently drop staging + DLQ rows (default: false)
// ---------------------------------------------------------------------------
router.post('/cleanup', async (req, res) => {
  const {
    olderThanMinutes = 60,
    statuses = 'failed,cancelled',
    dryRun = false,
    hardDelete = false
  } = req.body;

  const targetStatuses = String(statuses)
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => ['failed', 'cancelled', 'pending'].includes(s));

  if (targetStatuses.length === 0) {
    return res.status(400).json({
      error: 'No valid statuses provided. Allowed: failed, cancelled, pending.'
    });
  }

  const cutoff = new Date(Date.now() - Number(olderThanMinutes) * 60 * 1000);

  try {
    const jobs = await IngestionJob.find({
      status: { $in: targetStatuses },
      createdAt: { $lte: cutoff }
    })
      .select('jobId fileId status createdAt totalRowsProcessed errorCount')
      .lean();

    if (jobs.length === 0) {
      return res.status(200).json({
        message: 'No eligible jobs found for cleanup.',
        cleaned: 0,
        dryRun: Boolean(dryRun)
      });
    }

    const jobIds = jobs.map(j => j.jobId);
    const fileIds = jobs.map(j => j.fileId).filter(Boolean);

    let stagingDeleted = 0;
    let dlqDeleted = 0;
    let uploadErrorDeleted = 0;

    if (!dryRun && hardDelete) {
      // Hard delete: permanently remove all associated rows
      const [stagingResult, dlqResult, uploadResult] = await Promise.all([
        StagingData.deleteMany({
          $or: [
            { jobId: { $in: jobIds } },
            { fileId: { $in: fileIds } }
          ]
        }),
        DeadLetterQueue.deleteMany({ jobId: { $in: jobIds } }),
        UploadError.deleteMany({ fileId: { $in: fileIds } })
      ]);
      stagingDeleted = stagingResult.deletedCount;
      dlqDeleted = dlqResult.deletedCount;
      uploadErrorDeleted = uploadResult.deletedCount;

      await IngestionJob.updateMany(
        { jobId: { $in: jobIds } },
        { $set: { 'summary.cleanedAt': new Date(), 'summary.hardDeleted': true } }
      );
    } else if (!dryRun) {
      // Soft cleanup: record that cleanup ran but keep the rows
      await IngestionJob.updateMany(
        { jobId: { $in: jobIds } },
        { $set: { 'summary.cleanedAt': new Date(), 'summary.hardDeleted': false } }
      );
    }

    res.status(200).json({
      message: dryRun
        ? `Dry-run: ${jobs.length} job(s) would be cleaned up.`
        : `Cleanup complete: ${jobs.length} job(s) processed.`,
      dryRun: Boolean(dryRun),
      hardDelete: Boolean(hardDelete) && !dryRun,
      olderThanMinutes: Number(olderThanMinutes),
      targetStatuses,
      cutoff: cutoff.toISOString(),
      affected: jobs.length,
      jobs: jobs.map(j => ({
        jobId: j.jobId,
        fileId: j.fileId,
        status: j.status,
        createdAt: j.createdAt,
        totalRowsProcessed: j.totalRowsProcessed,
        errorCount: j.errorCount
      })),
      deletedCounts: (hardDelete && !dryRun)
        ? { stagingRows: stagingDeleted, dlqRows: dlqDeleted, uploadErrors: uploadErrorDeleted }
        : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:id
// Fetch a single job document by jobId.
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const job = await IngestionJob.findOne({ jobId: req.params.id }).lean();
    if (!job) {
      return res.status(404).json({ error: `Job '${req.params.id}' not found.` });
    }
    res.status(200).json({ job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/progress
// Lightweight polling snapshot — no long-lived connection required.
// Returns the same payload shape as the SSE 'progress' event.
// ---------------------------------------------------------------------------
router.get('/:id/progress', async (req, res) => {
  try {
    const job = await IngestionJob.findOne({ jobId: req.params.id }).lean();
    if (!job) {
      return res.status(404).json({ error: `Job '${req.params.id}' not found.` });
    }
    res.status(200).json(buildProgressSnapshot(job));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/events
// Server-Sent Events (SSE) live telemetry stream.
//
// The client opens a persistent HTTP connection; the server pushes 'progress'
// events on each interval and a terminal 'done' event when the job reaches
// a terminal state (completed | failed | cancelled).
//
// Query params:
//   interval  - polling interval in ms (default: 1000, min: 500, max: 10000)
// ---------------------------------------------------------------------------
router.get('/:id/events', async (req, res) => {
  const { id } = req.params;
  const rawInterval = parseInt(req.query.interval, 10) || 1000;
  const pollIntervalMs = Math.min(Math.max(rawInterval, 500), 10000);

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Acknowledge with a 'connected' bootstrap event
  sendSSEEvent(res, 'connected', {
    jobId: id,
    message: 'SSE telemetry stream established.',
    pollIntervalMs,
    timestamp: new Date().toISOString()
  });
  flushSSE(res);

  const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
  let polling = null;

  const cleanup = () => {
    if (polling) {
      clearInterval(polling);
      polling = null;
    }
  };

  req.on('close', cleanup);
  req.on('abort', cleanup);

  const poll = async () => {
    try {
      const job = await IngestionJob.findOne({ jobId: id })
        .select(
          'jobId status fileName totalRowsProcessed validRows errorCount ' +
          'currentRateRowsPerSec throughputRowsPerSec startedAt completedAt ' +
          'lastProgressAt durationMs errorMessage'
        )
        .lean();

      if (!job) {
        sendSSEEvent(res, 'error', {
          jobId: id,
          message: `Job '${id}' not found.`,
          timestamp: new Date().toISOString()
        });
        flushSSE(res);
        cleanup();
        res.end();
        return;
      }

      sendSSEEvent(res, 'progress', buildProgressSnapshot(job));
      flushSSE(res);

      if (TERMINAL_STATUSES.has(job.status)) {
        sendSSEEvent(res, 'done', {
          ...buildProgressSnapshot(job),
          message: `Job reached terminal state: ${job.status}`
        });
        flushSSE(res);
        cleanup();
        res.end();
      }
    } catch (err) {
      sendSSEEvent(res, 'error', {
        jobId: id,
        message: err.message,
        timestamp: new Date().toISOString()
      });
      flushSSE(res);
      cleanup();
      res.end();
    }
  };

  // First poll immediately, then schedule
  await poll();
  if (!res.writableEnded) {
    polling = setInterval(poll, pollIntervalMs);
  }
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/errors/export
// Streaming export endpoint using a database cursor to stream DLQ rows
// directly as a CSV download without memory buffering.
//
// Query params:
//   category   - filter by error category / errorType (e.g. 'VALIDATION_FAILED')
//   field      - filter / search by failedField
//   search     - field-level or text search across errors
//   sortOrder  - 'asc' | 'desc' row order (default: 'asc')
//   columns    - comma-separated list of columns to include
// ---------------------------------------------------------------------------
router.get('/:id/errors/export', async (req, res) => {
  const { id } = req.params;
  const {
    category,
    errorCategory,
    errorType,
    field,
    failedField,
    fieldName,
    search,
    q,
    sortOrder = 'asc',
    columns
  } = req.query;

  try {
    const job = await IngestionJob.findOne({ jobId: id })
      .select('jobId status fileName')
      .lean();

    if (!job) {
      return res.status(404).json({ error: `Job '${id}' not found.` });
    }

    const dlqFilter = { jobId: id };

    // 1. Error Category filter
    const cat = category || errorCategory || errorType;
    if (cat) {
      const catList = Array.isArray(cat)
        ? cat
        : String(cat).split(',').map(s => s.trim()).filter(Boolean);
      if (catList.length === 1) {
        dlqFilter.errorType = { $regex: new RegExp(`^${escapeRegex(catList[0])}$`, 'i') };
      } else if (catList.length > 1) {
        dlqFilter.errorType = { $in: catList.map(c => new RegExp(`^${escapeRegex(c)}$`, 'i')) };
      }
    }

    // 2. Field-level filter / search
    const targetField = field || failedField || fieldName;
    if (targetField) {
      const escapedField = escapeRegex(String(targetField).trim());
      dlqFilter.failedField = { $regex: new RegExp(escapedField, 'i') };
    }

    // 3. Search filter
    const searchQuery = search || q;
    if (searchQuery) {
      const escapedSearch = escapeRegex(String(searchQuery).trim());
      const searchRegex = { $regex: new RegExp(escapedSearch, 'i') };
      const searchConditions = [
        { failedField: searchRegex },
        { rejectedReason: searchRegex },
        { errorMessage: searchRegex },
        { errorType: searchRegex }
      ];
      if (dlqFilter.$or) {
        dlqFilter.$and = [
          { $or: dlqFilter.$or },
          { $or: searchConditions }
        ];
        delete dlqFilter.$or;
      } else {
        dlqFilter.$or = searchConditions;
      }
    }

    const sortDir = sortOrder === 'desc' ? -1 : 1;

    // Database cursor: streams records from MongoDB without memory buffering
    const cursor = DeadLetterQueue.find(dlqFilter)
      .sort({ rowNumber: sortDir })
      .lean()
      .cursor();

    const exportFilename = `job_${id}_errors_${Date.now()}.csv`;

    // Configure headers for streaming CSV download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFilename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const selectedColumns = columns
      ? String(columns).split(',').map(c => c.trim()).filter(Boolean)
      : ['jobId', 'rowNumber', 'errorType', 'failedField', 'rejectedReason', 'rawData', 'details', 'timestamp'];

    const csvTransform = new DLQToCsvStream(selectedColumns);

    // Cancel / destroy cursor if client disconnects early
    req.on('close', () => {
      if (!res.writableEnded) {
        if (typeof cursor.destroy === 'function') {
          cursor.destroy();
        }
      }
    });

    // Pipe cursor -> CSV transform -> HTTP response stream
    pipeline(cursor, csvTransform, res, (err) => {
      if (err) {
        if (!res.headersSent) {
          res.status(500).json({ error: 'Streaming export failed', details: err.message });
        } else {
          console.warn(`[jobRoutes] Export pipeline ended with error: ${err.message}`);
        }
      }
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/errors
// Paginated fetch of all rejected / errored rows for a given job.
// Queries both DeadLetterQueue (DLQ) and UploadError and merges results
// into a unified, sorted audit view.
//
// Query params:
//   page      - page number (default: 1)
//   limit     - records per page (default: 50, max: 200)
//   source    - 'dlq' | 'upload' | 'all' (default: 'all')
//   category  - filter by error category / errorType (e.g. 'VALIDATION_FAILED')
//   field     - filter / search by failedField
//   search    - field-level or text search across errors
//   sortOrder - 'asc' | 'desc' row order (default: 'asc')
// ---------------------------------------------------------------------------
router.get('/:id/errors', async (req, res) => {
  const { id } = req.params;
  const {
    page = 1,
    limit = 50,
    source = 'all',
    category,
    errorCategory,
    errorType,
    field,
    failedField,
    fieldName,
    search,
    q,
    sortOrder = 'asc'
  } = req.query;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 50, 200);
  const skip = (pageNum - 1) * limitNum;
  const sortDir = sortOrder === 'desc' ? -1 : 1;

  try {
    const job = await IngestionJob.findOne({ jobId: id })
      .select('jobId status errorCount fileName')
      .lean();

    if (!job) {
      return res.status(404).json({ error: `Job '${id}' not found.` });
    }

    const dlqFilter = { jobId: id };
    const uploadFilter = { fileId: id };

    // 1. Error Category filter
    const cat = category || errorCategory || errorType;
    if (cat) {
      const catList = Array.isArray(cat)
        ? cat
        : String(cat).split(',').map(s => s.trim()).filter(Boolean);
      if (catList.length === 1) {
        const catRegex = { $regex: new RegExp(`^${escapeRegex(catList[0])}$`, 'i') };
        dlqFilter.errorType = catRegex;
        uploadFilter.errorType = catRegex;
      } else if (catList.length > 1) {
        const catRegexes = catList.map(c => new RegExp(`^${escapeRegex(c)}$`, 'i'));
        dlqFilter.errorType = { $in: catRegexes };
        uploadFilter.errorType = { $in: catRegexes };
      }
    }

    // 2. Field-level filter / search
    const targetField = field || failedField || fieldName;
    if (targetField) {
      const escapedField = escapeRegex(String(targetField).trim());
      dlqFilter.failedField = { $regex: new RegExp(escapedField, 'i') };
      uploadFilter.$or = [
        { errorType: { $regex: new RegExp(escapedField, 'i') } },
        { errorMessage: { $regex: new RegExp(escapedField, 'i') } }
      ];
    }

    // 3. Search across multiple error fields
    const searchQuery = search || q;
    if (searchQuery) {
      const escapedSearch = escapeRegex(String(searchQuery).trim());
      const searchRegex = { $regex: new RegExp(escapedSearch, 'i') };
      const searchConditions = [
        { failedField: searchRegex },
        { rejectedReason: searchRegex },
        { errorMessage: searchRegex },
        { errorType: searchRegex }
      ];
      if (dlqFilter.$or) {
        dlqFilter.$and = [
          { $or: dlqFilter.$or },
          { $or: searchConditions }
        ];
        delete dlqFilter.$or;
      } else {
        dlqFilter.$or = searchConditions;
      }

      const uploadSearchConditions = [
        { errorMessage: searchRegex },
        { errorType: searchRegex }
      ];
      if (uploadFilter.$or) {
        uploadFilter.$and = [
          { $or: uploadFilter.$or },
          { $or: uploadSearchConditions }
        ];
        delete uploadFilter.$or;
      } else {
        uploadFilter.$or = uploadSearchConditions;
      }
    }

    let dlqErrors = [];
    let uploadErrors = [];
    let dlqTotal = 0;
    let uploadTotal = 0;

    // Normalize each record to a consistent shape
    const normalize = (doc, src) => ({
      source: src,
      rowNumber: doc.rowNumber,
      rejectedReason: doc.rejectedReason ?? doc.errorMessage ?? null,
      failedField: doc.failedField ?? (src === 'upload' ? doc.errorType : null),
      errorType: doc.errorType ?? (src === 'dlq' ? 'MALFORMED_ROW' : 'PARSER_ERROR'),
      rawData: doc.rawData ?? doc.rawRow ?? null,
      details: doc.details ?? null,
      timestamp: doc.timestamp ?? doc.createdAt ?? null,
      _id: doc._id
    });

    let mergedErrors;
    let totalErrors;

    if (source === 'all') {
      const fetchLimit = skip + limitNum;
      [dlqErrors, dlqTotal, uploadErrors, uploadTotal] = await Promise.all([
        DeadLetterQueue.find(dlqFilter)
          .sort({ rowNumber: sortDir })
          .limit(fetchLimit)
          .lean(),
        DeadLetterQueue.countDocuments(dlqFilter),
        UploadError.find(uploadFilter)
          .sort({ rowNumber: sortDir })
          .limit(fetchLimit)
          .lean(),
        UploadError.countDocuments(uploadFilter)
      ]);

      const combined = [
        ...dlqErrors.map(d => normalize(d, 'dlq')),
        ...uploadErrors.map(d => normalize(d, 'upload'))
      ].sort((a, b) => sortDir * ((a.rowNumber ?? 0) - (b.rowNumber ?? 0)));

      totalErrors = dlqTotal + uploadTotal;
      mergedErrors = combined.slice(skip, skip + limitNum);
    } else if (source === 'dlq') {
      [dlqErrors, dlqTotal] = await Promise.all([
        DeadLetterQueue.find(dlqFilter)
          .sort({ rowNumber: sortDir })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        DeadLetterQueue.countDocuments(dlqFilter)
      ]);
      mergedErrors = dlqErrors.map(d => normalize(d, 'dlq'));
      totalErrors = dlqTotal;
    } else {
      [uploadErrors, uploadTotal] = await Promise.all([
        UploadError.find(uploadFilter)
          .sort({ rowNumber: sortDir })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        UploadError.countDocuments(uploadFilter)
      ]);
      mergedErrors = uploadErrors.map(d => normalize(d, 'upload'));
      totalErrors = uploadTotal;
    }

    res.status(200).json({
      jobId: id,
      fileName: job.fileName,
      jobStatus: job.status,
      totalErrors,
      pagination: {
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(totalErrors / limitNum),
        returned: mergedErrors.length
      },
      filters: {
        source,
        category: cat || null,
        field: targetField || null,
        search: searchQuery || null
      },
      errors: mergedErrors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/jobs/:id/cancel
// Soft-cancel a running or pending job. Marks the IngestionJob as 'cancelled'
// so the ingestion worker's onBatch callback can detect and stop gracefully.
// ---------------------------------------------------------------------------
router.post('/:id/cancel', async (req, res) => {
  const { id } = req.params;
  const { reason = 'Cancelled via API' } = req.body;

  try {
    const job = await IngestionJob.findOne({ jobId: id });
    if (!job) {
      return res.status(404).json({ error: `Job '${id}' not found.` });
    }

    const TERMINAL = ['completed', 'failed', 'cancelled'];
    if (TERMINAL.includes(job.status)) {
      return res.status(409).json({
        error: `Job '${id}' is already in terminal state '${job.status}' and cannot be cancelled.`
      });
    }

    await job.markCancelled(reason);

    res.status(200).json({
      message: `Job '${id}' marked as cancelled.`,
      jobId: id,
      status: 'cancelled',
      reason
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.DLQToCsvStream = DLQToCsvStream;
router.escapeCsvValue = escapeCsvValue;
router.escapeRegex = escapeRegex;

module.exports = router;
