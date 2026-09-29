/**
 * verifyJobTelemetryRoutes.js
 *
 * Integration test suite for StreamWeaver Job Telemetry & Error Audit API.
 *
 * Covers:
 *  - GET  /api/jobs/:id/progress   (polling snapshot)
 *  - GET  /api/jobs/:id/events     (SSE stream parsing)
 *  - GET  /api/jobs/:id/errors     (paginated DLQ + UploadError audit)
 *  - POST /api/jobs/:id/cancel     (soft-cancel)
 *  - POST /api/jobs/cleanup        (dry-run and hard-delete modes)
 *  - DB index verification on DLQ, StagingData, IngestionJob
 *
 * Usage:
 *   node tests/verifyJobTelemetryRoutes.js
 *
 * Requires a running MongoDB instance. Set MONGO_URI env var or default
 * to mongodb://localhost:27017/streamweaver_test.
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI =
  process.env.MONGO_URI || 'mongodb://localhost:27017/streamweaver_test';

const http = require('node:http');
const assert = require('node:assert');
const { connectDB, disconnectDB } = require('../src/config/db');
const IngestionJob = require('../src/models/IngestionJob');
const DeadLetterQueue = require('../src/models/DeadLetterQueue');
const UploadError = require('../src/models/UploadError');
const StagingData = require('../src/models/StagingData');
const app = require('../src/index');

// ---------------------------------------------------------------------------
// Test plumbing
// ---------------------------------------------------------------------------

let server;
let baseUrl;
let testJobId;
let testFileId;

const PASS = '\u2713';
const FAIL = '\u2717';

function log(label, msg) {
  console.log(`  [${label}] ${msg}`);
}

/** Promisified HTTP GET helper. Returns { status, body }. */
function httpGet(path) {
  return new Promise((resolve, reject) => {
    const url = `${baseUrl}${path}`;
    http
      .get(url, (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      })
      .on('error', reject);
  });
}

/** Promisified HTTP POST helper. Returns { status, body }. */
function httpPost(path, payload = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'localhost',
      port: server.address().port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Consume the first N SSE events from GET :path.
 * Returns an array of { event, data } objects.
 */
function collectSSEEvents(path, maxEvents = 3, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const events = [];
    const url = `${baseUrl}${path}`;

    const req = http.get(url, (res) => {
      let buffer = '';
      let currentEvent = null;

      const timer = setTimeout(() => {
        req.destroy();
        resolve(events);
      }, timeoutMs);

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.replace('event:', '').trim();
          } else if (line.startsWith('data:')) {
            const rawData = line.replace('data:', '').trim();
            try {
              events.push({ event: currentEvent, data: JSON.parse(rawData) });
            } catch {
              events.push({ event: currentEvent, data: rawData });
            }
            currentEvent = null;
          }
        }

        if (events.length >= maxEvents) {
          clearTimeout(timer);
          req.destroy();
          resolve(events);
        }
      });

      res.on('end', () => {
        clearTimeout(timer);
        resolve(events);
      });

      res.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    req.on('error', (err) => {
      if (err.code === 'ECONNRESET') {
        resolve(events); // client destroyed after max events
      } else {
        reject(err);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Setup & teardown
// ---------------------------------------------------------------------------

async function setup() {
  await connectDB();

  // Wipe test data
  await IngestionJob.deleteMany({ jobId: /^test_job_/ });
  await DeadLetterQueue.deleteMany({ jobId: /^test_job_/ });
  await UploadError.deleteMany({ fileId: /^test_job_/ });
  await StagingData.deleteMany({ jobId: /^test_job_/ });

  // Create a synthetic IngestionJob in 'processing' state
  testJobId = `test_job_${Date.now()}`;
  testFileId = testJobId;

  const job = await IngestionJob.create({
    jobId: testJobId,
    fileId: testFileId,
    fileName: 'synthetic_test.csv',
    status: 'processing',
    startedAt: new Date(),
    totalRowsProcessed: 500,
    validRows: 480,
    errorCount: 20,
    currentRateRowsPerSec: 250,
    lastProgressAt: new Date()
  });

  // Seed DLQ errors
  const dlqDocs = Array.from({ length: 15 }, (_, i) => ({
    jobId: testJobId,
    rowNumber: i + 1,
    rawData: { field: `bad_value_${i}` },
    rejectedReason: `Validation failed on field_${i % 3}`,
    failedField: `field_${i % 3}`,
    timestamp: new Date()
  }));
  await DeadLetterQueue.insertMany(dlqDocs);

  // Seed UploadError records
  const uploadErrDocs = Array.from({ length: 5 }, (_, i) => ({
    fileId: testFileId,
    rowNumber: 100 + i,
    rawRow: { col: 'x' },
    errorType: 'VALIDATION_FAILED',
    errorMessage: `Column mismatch at row ${100 + i}`
  }));
  await UploadError.insertMany(uploadErrDocs);

  // Start HTTP server on a random port
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://localhost:${server.address().port}`;

  console.log(`\n[Setup] Test DB connected. Server on ${baseUrl}`);
  console.log(`[Setup] Test job: ${testJobId}\n`);
}

async function teardown() {
  await IngestionJob.deleteMany({ jobId: /^test_job_/ });
  await DeadLetterQueue.deleteMany({ jobId: /^test_job_/ });
  await UploadError.deleteMany({ fileId: /^test_job_/ });
  await StagingData.deleteMany({ jobId: /^test_job_/ });

  await new Promise((resolve) => server.close(resolve));
  await disconnectDB();
  console.log('\n[Teardown] Cleaned up and disconnected.');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testProgressPollingEndpoint() {
  console.log('[Test 1] GET /api/jobs/:id/progress — polling snapshot');

  const { status, body } = await httpGet(`/api/jobs/${testJobId}/progress`);
  assert.strictEqual(status, 200, `Expected 200, got ${status}`);
  assert.strictEqual(body.jobId, testJobId, 'jobId should match');
  assert.strictEqual(body.status, 'processing', 'Status should be processing');
  assert.strictEqual(typeof body.totalRowsProcessed, 'number', 'totalRowsProcessed should be number');
  assert.strictEqual(typeof body.errorCount, 'number', 'errorCount should be number');
  assert.strictEqual(typeof body.currentRateRowsPerSec, 'number', 'currentRateRowsPerSec should be number');
  assert.strictEqual(typeof body.avgThroughputRowsPerSec, 'number', 'avgThroughputRowsPerSec should be number');
  assert.ok(body.timestamp, 'Should include ISO timestamp');
  assert.ok(body.elapsedMs >= 0, 'elapsedMs should be non-negative');

  log(PASS, 'Progress snapshot fields verified');

  // Test 404 case
  const { status: s404 } = await httpGet('/api/jobs/nonexistent_job_xyz/progress');
  assert.strictEqual(s404, 404, 'Should return 404 for unknown job');
  log(PASS, '404 returned for unknown job');
}

async function testSSEStream() {
  console.log('[Test 2] GET /api/jobs/:id/events — SSE telemetry stream');

  const events = await collectSSEEvents(`/api/jobs/${testJobId}/events?interval=600`, 2, 4000);

  assert.ok(events.length >= 1, `Expected at least 1 SSE event, got ${events.length}`);

  const connected = events.find(e => e.event === 'connected');
  assert.ok(connected, 'Should receive a "connected" event');
  assert.strictEqual(connected.data.jobId, testJobId, 'connected event should carry jobId');

  const progress = events.find(e => e.event === 'progress');
  assert.ok(progress, 'Should receive at least one "progress" event');
  assert.strictEqual(progress.data.jobId, testJobId);
  assert.strictEqual(typeof progress.data.totalRowsProcessed, 'number');
  assert.strictEqual(typeof progress.data.currentRateRowsPerSec, 'number');
  assert.ok(progress.data.timestamp, 'progress event should have timestamp');

  log(PASS, `Received ${events.length} SSE events (connected + progress)`);
  log(PASS, 'SSE payload shape verified');
}

async function testSSETerminatesOnCompletion() {
  console.log('[Test 3] SSE stream — terminates on completed job');

  // Create a separate job that is already completed
  const completedJobId = `test_job_done_${Date.now()}`;
  await IngestionJob.create({
    jobId: completedJobId,
    fileId: completedJobId,
    fileName: 'done.csv',
    status: 'completed',
    startedAt: new Date(Date.now() - 5000),
    completedAt: new Date(),
    totalRowsProcessed: 1000,
    validRows: 990,
    errorCount: 10,
    throughputRowsPerSec: 200,
    durationMs: 5000
  });

  const events = await collectSSEEvents(`/api/jobs/${completedJobId}/events?interval=500`, 5, 5000);

  const doneEvent = events.find(e => e.event === 'done');
  assert.ok(doneEvent, 'Should receive a "done" event for a completed job');
  assert.strictEqual(doneEvent.data.status, 'completed');
  assert.ok(doneEvent.data.message.includes('terminal'));

  // Cleanup
  await IngestionJob.deleteOne({ jobId: completedJobId });

  log(PASS, 'SSE "done" event received for completed job');
  log(PASS, 'Stream terminated correctly');
}

async function testErrorsEndpointPagination() {
  console.log('[Test 4] GET /api/jobs/:id/errors — pagination and source filtering');

  // Default (all sources, page 1)
  const { status, body } = await httpGet(`/api/jobs/${testJobId}/errors`);
  assert.strictEqual(status, 200);
  assert.strictEqual(body.jobId, testJobId);
  assert.strictEqual(typeof body.totalErrors, 'number', 'totalErrors should be a number');
  assert.ok(body.totalErrors >= 15, `Expected >= 15 errors, got ${body.totalErrors}`);
  assert.ok(Array.isArray(body.errors), 'errors should be an array');
  assert.ok(body.pagination, 'Should include pagination metadata');
  assert.ok(body.pagination.pages >= 1, 'Should have at least 1 page');

  // Verify normalized error shape
  const first = body.errors[0];
  assert.ok(first.rowNumber !== undefined, 'Error should have rowNumber');
  assert.ok(first.source === 'dlq' || first.source === 'upload', 'Error should have source tag');
  assert.ok(first.rejectedReason || first.failedField, 'Error should have a reason or failed field');

  log(PASS, `Total errors: ${body.totalErrors}, page 1 returned: ${body.errors.length}`);

  // DLQ-only source filter
  const { status: s2, body: b2 } = await httpGet(`/api/jobs/${testJobId}/errors?source=dlq&limit=5&page=1`);
  assert.strictEqual(s2, 200);
  assert.ok(b2.errors.every(e => e.source === 'dlq'), 'All errors should be from dlq');
  assert.ok(b2.errors.length <= 5, 'Limit should be respected');
  log(PASS, 'DLQ-only filter works correctly');

  // Upload-only source filter
  const { status: s3, body: b3 } = await httpGet(`/api/jobs/${testJobId}/errors?source=upload`);
  assert.strictEqual(s3, 200);
  assert.ok(b3.errors.every(e => e.source === 'upload'), 'All errors should be from upload');
  log(PASS, 'Upload-only filter works correctly');

  // Pagination: page 2 with limit 5
  const { status: s4, body: b4 } = await httpGet(`/api/jobs/${testJobId}/errors?limit=5&page=2`);
  assert.strictEqual(s4, 200);
  assert.ok(b4.pagination.page === 2);
  log(PASS, 'Page 2 pagination works correctly');

  // 404 for unknown job
  const { status: s5 } = await httpGet('/api/jobs/unknown_job/errors');
  assert.strictEqual(s5, 404);
  log(PASS, '404 for unknown job in errors endpoint');
}

async function testCancelJob() {
  console.log('[Test 5] POST /api/jobs/:id/cancel — soft-cancel');

  const cancelJobId = `test_job_cancel_${Date.now()}`;
  await IngestionJob.create({
    jobId: cancelJobId,
    fileId: cancelJobId,
    fileName: 'cancel_me.csv',
    status: 'processing',
    startedAt: new Date()
  });

  const { status, body } = await httpPost(`/api/jobs/${cancelJobId}/cancel`, {
    reason: 'Stream aborted by client'
  });
  assert.strictEqual(status, 200);
  assert.strictEqual(body.status, 'cancelled');
  assert.strictEqual(body.reason, 'Stream aborted by client');

  // Verify DB was updated
  const updated = await IngestionJob.findOne({ jobId: cancelJobId }).lean();
  assert.strictEqual(updated.status, 'cancelled');
  assert.ok(updated.completedAt, 'completedAt should be set');
  assert.ok(updated.errorMessage.includes('Stream aborted'), 'errorMessage should reflect reason');

  log(PASS, 'Job successfully cancelled');

  // Try cancelling again — should return 409
  const { status: s2, body: b2 } = await httpPost(`/api/jobs/${cancelJobId}/cancel`, {});
  assert.strictEqual(s2, 409);
  assert.ok(b2.error.includes('terminal'), 'Should report already in terminal state');
  log(PASS, '409 returned when cancelling already-terminal job');

  await IngestionJob.deleteOne({ jobId: cancelJobId });
}

async function testCleanupRoutineDryRun() {
  console.log('[Test 6] POST /api/jobs/cleanup — dry-run mode');

  // Create an old failed job
  const failedJobId = `test_job_failed_${Date.now()}`;
  const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
  await IngestionJob.create({
    jobId: failedJobId,
    fileId: failedJobId,
    fileName: 'failed_upload.csv',
    status: 'failed',
    createdAt: oldDate,
    totalRowsProcessed: 100,
    errorCount: 5
  });

  const { status, body } = await httpPost('/api/jobs/cleanup', {
    olderThanMinutes: 60,
    statuses: 'failed,cancelled',
    dryRun: true,
    hardDelete: false
  });

  assert.strictEqual(status, 200);
  assert.strictEqual(body.dryRun, true, 'dryRun should be true');
  assert.ok(body.affected >= 1, `Expected at least 1 job eligible, got ${body.affected}`);
  assert.ok(body.message.includes('Dry-run'), 'Message should mention dry-run');
  assert.strictEqual(body.deletedCounts, null, 'deletedCounts should be null in dry-run');
  log(PASS, `Dry-run identified ${body.affected} eligible job(s)`);

  // Verify no actual deletion occurred
  const stillExists = await IngestionJob.findOne({ jobId: failedJobId }).lean();
  assert.ok(stillExists, 'Job should still exist after dry-run');
  log(PASS, 'No records deleted in dry-run mode');

  await IngestionJob.deleteOne({ jobId: failedJobId });
}

async function testCleanupRoutineHardDelete() {
  console.log('[Test 7] POST /api/jobs/cleanup — hard delete mode');

  const cleanJobId = `test_job_clean_${Date.now()}`;
  const oldDate = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago

  await IngestionJob.create({
    jobId: cleanJobId,
    fileId: cleanJobId,
    fileName: 'aborted.csv',
    status: 'cancelled',
    createdAt: oldDate,
    totalRowsProcessed: 50,
    errorCount: 2
  });

  // Seed some staging + DLQ rows for this job
  await StagingData.insertMany([
    { fileId: cleanJobId, jobId: cleanJobId, batchId: 'b1', rowNumber: 1, payload: { x: 1 } },
    { fileId: cleanJobId, jobId: cleanJobId, batchId: 'b1', rowNumber: 2, payload: { x: 2 } }
  ]);
  await DeadLetterQueue.insertMany([
    { jobId: cleanJobId, rowNumber: 1, rejectedReason: 'bad', rawData: {} }
  ]);

  const { status, body } = await httpPost('/api/jobs/cleanup', {
    olderThanMinutes: 60,
    statuses: 'cancelled',
    dryRun: false,
    hardDelete: true
  });

  assert.strictEqual(status, 200);
  assert.strictEqual(body.dryRun, false);
  assert.strictEqual(body.hardDelete, true);
  assert.ok(body.affected >= 1);
  assert.ok(body.deletedCounts, 'deletedCounts should be present in hard-delete mode');
  assert.ok(body.deletedCounts.stagingRows >= 2, `Expected >= 2 staging rows deleted`);
  assert.ok(body.deletedCounts.dlqRows >= 1, `Expected >= 1 DLQ row deleted`);

  log(PASS, `Hard delete: staging=${body.deletedCounts.stagingRows}, dlq=${body.deletedCounts.dlqRows}`);

  // Verify staging and DLQ rows are gone
  const remainingStaging = await StagingData.countDocuments({ jobId: cleanJobId });
  const remainingDlq = await DeadLetterQueue.countDocuments({ jobId: cleanJobId });
  assert.strictEqual(remainingStaging, 0, 'Staging rows should be deleted');
  assert.strictEqual(remainingDlq, 0, 'DLQ rows should be deleted');
  log(PASS, 'Staging and DLQ rows confirmed deleted from database');

  await IngestionJob.deleteOne({ jobId: cleanJobId });
}

async function testDBIndexes() {
  console.log('[Test 8] Verifying DB indexes on DLQ, StagingData, IngestionJob');

  // DLQ indexes
  const dlqIndexes = await DeadLetterQueue.collection.indexes();
  const dlqIndexKeys = dlqIndexes.map(idx => JSON.stringify(idx.key));
  assert.ok(dlqIndexKeys.some(k => k.includes('jobId') && k.includes('rowNumber')),
    'DLQ should have compound jobId+rowNumber index');
  assert.ok(dlqIndexKeys.some(k => k.includes('jobId') && k.includes('timestamp')),
    'DLQ should have compound jobId+timestamp index');
  log(PASS, 'DLQ compound indexes verified');

  // StagingData indexes
  const stagingIndexes = await StagingData.collection.indexes();
  const stagingIndexKeys = stagingIndexes.map(idx => JSON.stringify(idx.key));
  assert.ok(stagingIndexKeys.some(k => k.includes('fileId') && k.includes('rowNumber')),
    'StagingData should have compound fileId+rowNumber index');
  assert.ok(stagingIndexKeys.some(k => k.includes('jobId') && k.includes('rowNumber')),
    'StagingData should have compound jobId+rowNumber index');
  log(PASS, 'StagingData compound indexes verified');

  // IngestionJob indexes
  const jobIndexes = await IngestionJob.collection.indexes();
  const jobIndexKeys = jobIndexes.map(idx => JSON.stringify(idx.key));
  assert.ok(jobIndexKeys.some(k => k.includes('jobId')),
    'IngestionJob should have jobId index');
  assert.ok(jobIndexKeys.some(k => k.includes('status') && k.includes('createdAt')),
    'IngestionJob should have compound status+createdAt index');
  assert.ok(jobIndexKeys.some(k => k.includes('jobId') && k.includes('status')),
    'IngestionJob should have compound jobId+status index for SSE queries');
  log(PASS, 'IngestionJob indexes verified');
}

async function testJobListEndpoint() {
  console.log('[Test 9] GET /api/jobs — list with pagination and status filter');

  const { status, body } = await httpGet('/api/jobs');
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(body.jobs), 'jobs should be array');
  assert.ok(body.pagination, 'Should include pagination');
  log(PASS, `Job list returned ${body.jobs.length} jobs`);

  // Filter by status
  const { status: s2, body: b2 } = await httpGet('/api/jobs?status=processing&limit=5');
  assert.strictEqual(s2, 200);
  assert.ok(b2.jobs.every(j => j.status === 'processing'), 'All returned jobs should be processing');
  log(PASS, 'Status filter works on job list');
}

async function testIngestionJobProgressUpdate() {
  console.log('[Test 10] IngestionJob.updateProgress — real-time rate computation');

  const rateJobId = `test_job_rate_${Date.now()}`;
  const job = await IngestionJob.create({
    jobId: rateJobId,
    fileId: rateJobId,
    fileName: 'rate_test.csv',
    status: 'processing',
    startedAt: new Date(),
    totalRowsProcessed: 0,
    errorCount: 0
  });

  // First progress update
  await new Promise(r => setTimeout(r, 50)); // short wait to create a time window
  await job.updateProgress(1000, 5);

  const updated = await IngestionJob.findOne({ jobId: rateJobId }).lean();
  assert.strictEqual(updated.totalRowsProcessed, 1000);
  assert.strictEqual(updated.errorCount, 5);
  assert.strictEqual(updated.validRows, 995);
  assert.ok(updated.currentRateRowsPerSec > 0, 'currentRateRowsPerSec should be positive');
  assert.ok(updated.lastProgressAt, 'lastProgressAt should be set');
  assert.ok(updated.lastProgressWindowMs > 0, 'lastProgressWindowMs should be positive');
  log(PASS, `Rate computed: ${updated.currentRateRowsPerSec} rows/sec`);

  await IngestionJob.deleteOne({ jobId: rateJobId });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runAll() {
  try {
    await setup();

    await testProgressPollingEndpoint();
    await testSSEStream();
    await testSSETerminatesOnCompletion();
    await testErrorsEndpointPagination();
    await testCancelJob();
    await testCleanupRoutineDryRun();
    await testCleanupRoutineHardDelete();
    await testDBIndexes();
    await testJobListEndpoint();
    await testIngestionJobProgressUpdate();

    console.log('\n===========================================================');
    console.log(' ALL JOB TELEMETRY & ERROR AUDIT TESTS PASSED!');
    console.log('===========================================================\n');
  } catch (err) {
    console.error('\n Test Failure:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await teardown();
  }
}

runAll();
