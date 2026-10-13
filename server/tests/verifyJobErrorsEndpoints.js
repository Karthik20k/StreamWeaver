/**
 * verifyJobErrorsEndpoints.js
 *
 * Dedicated verification test suite for:
 * 1. GET /api/jobs/:id/errors (paginated endpoint with category filtering & field-level search)
 * 2. GET /api/jobs/:id/errors/export (streaming CSV export via database cursor with zero buffering)
 *
 * Run with:
 *   node tests/verifyJobErrorsEndpoints.js
 */

'use strict';

process.env.NODE_ENV = 'test';

const http = require('node:http');
const assert = require('node:assert');
const { Readable, Writable } = require('node:stream');
const express = require('express');

const jobRoutes = require('../src/routes/jobRoutes');
const { DLQToCsvStream, escapeCsvValue, escapeRegex } = jobRoutes;
const IngestionJob = require('../src/models/IngestionJob');
const DeadLetterQueue = require('../src/models/DeadLetterQueue');
const UploadError = require('../src/models/UploadError');

const PASS = '\u2713';
function log(msg) {
  console.log(`  [${PASS}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Unit tests for CSV escaping & regex helper
// ---------------------------------------------------------------------------
async function testCsvEscapingHelpers() {
  console.log('[Test 1] Testing CSV escaping & regex utilities...');

  assert.strictEqual(escapeCsvValue(null), '');
  assert.strictEqual(escapeCsvValue(undefined), '');
  assert.strictEqual(escapeCsvValue(123), '123');
  assert.strictEqual(escapeCsvValue(true), 'true');
  assert.strictEqual(escapeCsvValue('simple'), 'simple');

  // Values with comma
  assert.strictEqual(escapeCsvValue('hello, world'), '"hello, world"');

  // Values with quotes
  assert.strictEqual(escapeCsvValue('He said "Hello"'), '"He said ""Hello"""');

  // Values with newline
  assert.strictEqual(escapeCsvValue("Line 1\nLine 2"), '"Line 1\nLine 2"');

  // Complex objects
  const obj = { field: 'email', reason: 'Invalid, domain' };
  const escapedObj = escapeCsvValue(obj);
  assert.ok(escapedObj.startsWith('"') && escapedObj.endsWith('"'));
  assert.ok(escapedObj.includes('""field"":""email""'));

  // Regex escaping
  assert.strictEqual(escapeRegex('item.name'), 'item\\.name');
  assert.strictEqual(escapeRegex('price (USD)'), 'price \\(USD\\)');
  assert.strictEqual(escapeRegex('tag[0]'), 'tag\\[0\\]');

  log('CSV escaping and regex utilities passed');
}

// ---------------------------------------------------------------------------
// Unit tests for DLQToCsvStream transform
// ---------------------------------------------------------------------------
async function testDLQToCsvStream() {
  console.log('[Test 2] Testing DLQToCsvStream transform stream with zero memory buffering...');

  // Test 1: Normal row streaming
  const sampleDocs = [
    {
      jobId: 'job_123',
      rowNumber: 1,
      errorType: 'VALIDATION_FAILED',
      failedField: 'customerEmail',
      rejectedReason: 'Invalid email address: test@',
      rawData: { email: 'test@', amount: 50 },
      details: { rule: 'email_regex' },
      timestamp: new Date('2026-10-13T12:00:00Z')
    },
    {
      jobId: 'job_123',
      rowNumber: 2,
      errorType: 'MALFORMED_ROW',
      failedField: 'amount',
      rejectedReason: 'Amount must be positive, got -5',
      rawData: { email: 'bob@example.com', amount: -5 },
      details: null,
      timestamp: new Date('2026-10-13T12:00:01Z')
    }
  ];

  const readable = Readable.from(sampleDocs);
  const transform = new DLQToCsvStream();
  const chunks = [];

  await new Promise((resolve, reject) => {
    readable
      .pipe(transform)
      .on('data', (chunk) => chunks.push(chunk.toString()))
      .on('end', resolve)
      .on('error', reject);
  });

  const fullCsv = chunks.join('');
  const lines = fullCsv.trim().split(/\r?\n/);

  assert.strictEqual(lines.length, 3, 'Should produce 1 header line + 2 data rows');
  assert.strictEqual(
    lines[0],
    'jobId,rowNumber,errorType,failedField,rejectedReason,rawData,details,timestamp'
  );

  // Check line 1 contents
  assert.ok(lines[1].includes('job_123'));
  assert.ok(lines[1].includes('customerEmail'));
  assert.ok(lines[1].includes('VALIDATION_FAILED'));
  assert.ok(lines[1].includes('2026-10-13T12:00:00.000Z'));

  // Check line 2 contents with comma in rejectedReason
  assert.ok(lines[2].includes('"Amount must be positive, got -5"'));

  // Test 2: Empty stream still outputs headers
  const emptyReadable = Readable.from([]);
  const emptyTransform = new DLQToCsvStream();
  const emptyChunks = [];

  await new Promise((resolve, reject) => {
    emptyReadable
      .pipe(emptyTransform)
      .on('data', (chunk) => emptyChunks.push(chunk.toString()))
      .on('end', resolve)
      .on('error', reject);
  });

  const emptyCsv = emptyChunks.join('').trim();
  assert.strictEqual(
    emptyCsv,
    'jobId,rowNumber,errorType,failedField,rejectedReason,rawData,details,timestamp'
  );

  // Test 3: Custom selected columns
  const customReadable = Readable.from([sampleDocs[0]]);
  const customTransform = new DLQToCsvStream(['rowNumber', 'failedField', 'rejectedReason']);
  const customChunks = [];

  await new Promise((resolve, reject) => {
    customReadable
      .pipe(customTransform)
      .on('data', (chunk) => customChunks.push(chunk.toString()))
      .on('end', resolve)
      .on('error', reject);
  });

  const customLines = customChunks.join('').trim().split(/\r?\n/);
  assert.strictEqual(customLines[0], 'rowNumber,failedField,rejectedReason');
  assert.strictEqual(customLines[1], '1,customerEmail,Invalid email address: test@');

  log('DLQToCsvStream transform stream passed');
}

// ---------------------------------------------------------------------------
// HTTP API Integration Tests (Mocking Mongoose model operations)
// ---------------------------------------------------------------------------
async function testHttpEndpoints() {
  console.log('[Test 3] Testing HTTP API routes for errors and streaming export...');

  const app = express();
  app.use(express.json());
  app.use('/api/jobs', jobRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  function httpReq(path) {
    return new Promise((resolve, reject) => {
      http
        .get(`${baseUrl}${path}`, (res) => {
          let raw = '';
          res.on('data', (chunk) => (raw += chunk));
          res.on('end', () => {
            let body;
            try {
              body = JSON.parse(raw);
            } catch {
              body = raw;
            }
            resolve({ status: res.statusCode, headers: res.headers, body });
          });
        })
        .on('error', reject);
    });
  }

  // Backup original Mongoose methods
  const origJobFindOne = IngestionJob.findOne;
  const origDLQFind = DeadLetterQueue.find;
  const origDLQCount = DeadLetterQueue.countDocuments;
  const origUploadFind = UploadError.find;
  const origUploadCount = UploadError.countDocuments;

  const testJobId = 'job_test_stream_456';

  // Seed mock documents in memory for testing
  const mockJobDoc = {
    jobId: testJobId,
    fileId: testJobId,
    fileName: 'export_test.csv',
    status: 'completed',
    totalRowsProcessed: 100,
    validRows: 80,
    errorCount: 20
  };

  const mockDLQRows = Array.from({ length: 25 }, (_, i) => ({
    _id: `dlq_${i + 1}`,
    jobId: testJobId,
    fileId: testJobId,
    rowNumber: i + 1,
    errorType: i % 2 === 0 ? 'VALIDATION_FAILED' : 'MALFORMED_ROW',
    failedField: i % 3 === 0 ? 'customerEmail' : (i % 3 === 1 ? 'amount' : 'orderId'),
    rejectedReason: `Error at row ${i + 1} for field ${i % 3 === 0 ? 'customerEmail' : 'other'}`,
    rawData: { index: i + 1, value: `val_${i}` },
    details: { code: `ERR_${i}` },
    timestamp: new Date(`2026-10-13T10:00:${String(i).padStart(2, '0')}Z`)
  }));

  const mockUploadRows = Array.from({ length: 5 }, (_, i) => ({
    _id: `upload_${i + 1}`,
    fileId: testJobId,
    rowNumber: 100 + i,
    errorType: 'PARSER_ERROR',
    errorMessage: `Parser failed on row ${100 + i}`,
    rawRow: `raw_line_${i}`,
    details: null,
    createdAt: new Date(`2026-10-13T11:00:00Z`)
  }));

  // Helper to filter documents according to Mongoose-style criteria
  function applyFilter(doc, filter) {
    for (const key of Object.keys(filter)) {
      if (key === '$or') {
        const orConditions = filter.$or;
        const matched = orConditions.some((c) => applyFilter(doc, c));
        if (!matched) return false;
        continue;
      }
      if (key === '$and') {
        const andConditions = filter.$and;
        const matched = andConditions.every((c) => applyFilter(doc, c));
        if (!matched) return false;
        continue;
      }
      const val = doc[key];
      const target = filter[key];
      if (target instanceof RegExp) {
        if (!target.test(String(val || ''))) return false;
      } else if (target && typeof target === 'object' && target.$regex) {
        if (!target.$regex.test(String(val || ''))) return false;
      } else if (target && typeof target === 'object' && target.$in) {
        const matchAny = target.$in.some((item) => {
          if (item instanceof RegExp) return item.test(String(val || ''));
          return item === val;
        });
        if (!matchAny) return false;
      } else if (val !== target) {
        return false;
      }
    }
    return true;
  }

  // Setup spies/mocks on Mongoose models
  let dlqCursorCreated = false;

  IngestionJob.findOne = (query) => ({
    select: () => ({
      lean: async () => {
        if (query.jobId === testJobId) return mockJobDoc;
        return null;
      }
    })
  });

  DeadLetterQueue.find = (filter) => {
    let filtered = mockDLQRows.filter((d) => applyFilter(d, filter));
    let sortFn = (a, b) => a.rowNumber - b.rowNumber;
    let skipCount = 0;
    let limitCount = Infinity;

    const queryObj = {
      sort: (sortObj) => {
        if (sortObj && sortObj.rowNumber === -1) {
          sortFn = (a, b) => b.rowNumber - a.rowNumber;
        }
        return queryObj;
      },
      skip: (n) => {
        skipCount = n;
        return queryObj;
      },
      limit: (n) => {
        limitCount = n;
        return queryObj;
      },
      lean: () => queryObj,
      then: (resolve, reject) => {
        const sorted = [...filtered].sort(sortFn);
        const sliced = sorted.slice(skipCount, skipCount + limitCount);
        resolve(sliced);
      },
      cursor: () => {
        dlqCursorCreated = true;
        const sorted = [...filtered].sort(sortFn);
        return Readable.from(sorted);
      }
    };
    return queryObj;
  };

  DeadLetterQueue.countDocuments = async (filter) => {
    return mockDLQRows.filter((d) => applyFilter(d, filter)).length;
  };

  UploadError.find = (filter) => {
    let filtered = mockUploadRows.filter((d) => applyFilter(d, filter));
    let skipCount = 0;
    let limitCount = Infinity;

    const queryObj = {
      sort: () => queryObj,
      skip: (n) => {
        skipCount = n;
        return queryObj;
      },
      limit: (n) => {
        limitCount = n;
        return queryObj;
      },
      lean: () => queryObj,
      then: (resolve) => {
        const sliced = filtered.slice(skipCount, skipCount + limitCount);
        resolve(sliced);
      }
    };
    return queryObj;
  };

  UploadError.countDocuments = async (filter) => {
    return mockUploadRows.filter((d) => applyFilter(d, filter)).length;
  };

  try {
    // -------------------------------------------------------------------------
    // Subtest 3.1: Paginated errors endpoint
    // -------------------------------------------------------------------------
    console.log('  Subtest 3.1: GET /api/jobs/:id/errors (pagination & shape)...');
    const res1 = await httpReq(`/api/jobs/${testJobId}/errors?page=1&limit=10`);
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.body.jobId, testJobId);
    assert.strictEqual(res1.body.pagination.page, 1);
    assert.strictEqual(res1.body.pagination.limit, 10);
    assert.strictEqual(res1.body.pagination.returned, 10);
    assert.strictEqual(res1.body.totalErrors, 30); // 25 DLQ + 5 Upload
    assert.strictEqual(res1.body.pagination.pages, 3);
    log('Default pagination returned 10 errors across 3 total pages');

    // Page 2
    const resPage2 = await httpReq(`/api/jobs/${testJobId}/errors?page=2&limit=10`);
    assert.strictEqual(resPage2.status, 200);
    assert.strictEqual(resPage2.body.pagination.page, 2);
    assert.strictEqual(resPage2.body.errors.length, 10);
    assert.strictEqual(resPage2.body.errors[0].rowNumber, 11);
    log('Page 2 pagination successfully returned items 11-20');

    // DLQ-only source
    const resDlqOnly = await httpReq(`/api/jobs/${testJobId}/errors?source=dlq&page=1&limit=5`);
    assert.strictEqual(resDlqOnly.status, 200);
    assert.strictEqual(resDlqOnly.body.totalErrors, 25);
    assert.strictEqual(resDlqOnly.body.errors.length, 5);
    assert.ok(resDlqOnly.body.errors.every((e) => e.source === 'dlq'));
    log('DLQ-only filter returned exclusively DLQ errors');

    // -------------------------------------------------------------------------
    // Subtest 3.2: Filtering by error category
    // -------------------------------------------------------------------------
    console.log('  Subtest 3.2: Error category filtering...');
    const resCat = await httpReq(`/api/jobs/${testJobId}/errors?source=dlq&category=VALIDATION_FAILED`);
    assert.strictEqual(resCat.status, 200);
    assert.ok(resCat.body.totalErrors > 0);
    assert.ok(resCat.body.errors.every((e) => e.errorType === 'VALIDATION_FAILED'));
    assert.strictEqual(resCat.body.filters.category, 'VALIDATION_FAILED');
    log('Single error category filter (?category=VALIDATION_FAILED) verified');

    // Multiple categories
    const resMultiCat = await httpReq(
      `/api/jobs/${testJobId}/errors?source=dlq&category=VALIDATION_FAILED,MALFORMED_ROW`
    );
    assert.strictEqual(resMultiCat.status, 200);
    assert.strictEqual(resMultiCat.body.totalErrors, 25);
    log('Multiple categories filter (?category=A,B) verified');

    // -------------------------------------------------------------------------
    // Subtest 3.3: Field-level search & general text search
    // -------------------------------------------------------------------------
    console.log('  Subtest 3.3: Field-level search...');
    const resField = await httpReq(`/api/jobs/${testJobId}/errors?source=dlq&field=customerEmail`);
    assert.strictEqual(resField.status, 200);
    assert.ok(resField.body.totalErrors > 0);
    assert.ok(resField.body.errors.every((e) => e.failedField === 'customerEmail'));
    log('Exact field-level filter (?field=customerEmail) verified');

    // Partial field search
    const resPartialField = await httpReq(`/api/jobs/${testJobId}/errors?source=dlq&field=Email`);
    assert.strictEqual(resPartialField.status, 200);
    assert.ok(resPartialField.body.totalErrors > 0);
    assert.ok(resPartialField.body.errors.every((e) => e.failedField === 'customerEmail'));
    log('Partial field search (?field=Email) verified');

    // Text search
    const resSearch = await httpReq(`/api/jobs/${testJobId}/errors?source=dlq&search=amount`);
    assert.strictEqual(resSearch.status, 200);
    assert.ok(resSearch.body.totalErrors > 0);
    log('General text search (?search=amount) verified');

    // -------------------------------------------------------------------------
    // Subtest 3.4: Streaming CSV export via database cursor
    // -------------------------------------------------------------------------
    console.log('  Subtest 3.4: GET /api/jobs/:id/errors/export (streaming CSV)...');
    dlqCursorCreated = false;
    const resExport = await httpReq(`/api/jobs/${testJobId}/errors/export`);
    assert.strictEqual(resExport.status, 200);
    assert.strictEqual(dlqCursorCreated, true, 'Export MUST invoke DeadLetterQueue.cursor()');

    // Check HTTP headers
    assert.ok(resExport.headers['content-type'].includes('text/csv'));
    assert.ok(resExport.headers['content-disposition'].includes('attachment; filename="job_'));
    assert.ok(resExport.headers['content-disposition'].endsWith('.csv"'));
    assert.strictEqual(resExport.headers['cache-control'], 'no-cache, no-store, must-revalidate');

    // Check CSV payload structure
    const exportCsv = typeof resExport.body === 'string' ? resExport.body : '';
    const exportLines = exportCsv.trim().split(/\r?\n/);
    assert.strictEqual(exportLines.length, 26, '1 header line + 25 DLQ rows');
    assert.strictEqual(
      exportLines[0],
      'jobId,rowNumber,errorType,failedField,rejectedReason,rawData,details,timestamp'
    );
    assert.ok(exportLines[1].includes(testJobId));
    log('Streaming CSV export returned full 25 DLQ rows with correct RFC 4180 headers');

    // Subtest 3.5: Filtered export
    console.log('  Subtest 3.5: Filtered streaming CSV export...');
    const resFilteredExport = await httpReq(
      `/api/jobs/${testJobId}/errors/export?category=VALIDATION_FAILED&columns=rowNumber,errorType,failedField`
    );
    assert.strictEqual(resFilteredExport.status, 200);
    const filteredCsvLines = resFilteredExport.body.trim().split(/\r?\n/);
    assert.strictEqual(filteredCsvLines[0], 'rowNumber,errorType,failedField');
    assert.ok(filteredCsvLines.length > 1);
    for (let i = 1; i < filteredCsvLines.length; i++) {
      assert.ok(filteredCsvLines[i].includes('VALIDATION_FAILED'));
    }
    log('Filtered CSV export respects category and columns options');

    // Subtest 3.6: 404 for unknown job
    console.log('  Subtest 3.6: 404 behavior for non-existent job...');
    const resUnknownErrors = await httpReq('/api/jobs/non_existent_job/errors');
    assert.strictEqual(resUnknownErrors.status, 404);
    assert.ok(resUnknownErrors.body.error.includes('not found'));

    const resUnknownExport = await httpReq('/api/jobs/non_existent_job/errors/export');
    assert.strictEqual(resUnknownExport.status, 404);
    assert.ok(resUnknownExport.body.error.includes('not found'));
    log('404 properly returned for unknown jobs on both endpoints');

  } finally {
    // Restore mocks
    IngestionJob.findOne = origJobFindOne;
    DeadLetterQueue.find = origDLQFind;
    DeadLetterQueue.countDocuments = origDLQCount;
    UploadError.find = origUploadFind;
    UploadError.countDocuments = origUploadCount;
    server.close();
  }
}

// ---------------------------------------------------------------------------
// Main test runner
// ---------------------------------------------------------------------------
async function run() {
  console.log('\n===============================================================');
  console.log(' VERIFYING JOB ERRORS PAGINATION & STREAMING EXPORT ENDPOINTS');
  console.log('===============================================================\n');

  await testCsvEscapingHelpers();
  await testDLQToCsvStream();
  await testHttpEndpoints();

  console.log('\n===============================================================');
  console.log(' ALL PAGINATION, FILTERING, & STREAMING EXPORT TESTS PASSED!   ');
  console.log('===============================================================\n');
}

run().catch((err) => {
  console.error('\n Test Failure:', err.message);
  console.error(err.stack);
  process.exit(1);
});
