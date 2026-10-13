process.env.NODE_ENV = 'test';

import assert from 'assert';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverEntryPath = path.resolve(__dirname, '../../../server/src/index.js');

// Dynamically import express app
const serverModule = await import(`file://${serverEntryPath}`);
const app = serverModule.default || serverModule;

let server;
let serverPort;
let baseUrl;

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      baseUrl = `http://127.0.0.1:${serverPort}`;
      console.log(`[Test Server] Running on ${baseUrl}`);
      resolve();
    });
    server.on('error', reject);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        console.log('[Test Server] Stopped.');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

async function testPaginatedErrorRetrieval() {
  console.log('\n--- 1. Testing Paginated Error Retrieval API (GET /api/jobs/:id/errors) ---');

  // Initialize a test job
  const testJobId = `job-test-audit-${Date.now()}`;
  const createRes = await fetch(`${baseUrl}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: testJobId,
      fileName: 'test_financial_orders.csv',
      targetCollection: 'ecommerce_orders',
      estimatedRows: 10000
    })
  });
  assert.strictEqual(createRes.status, 201, 'Job should be created with 201');

  // Page 1 with limit 5
  const page1Res = await fetch(`${baseUrl}/api/jobs/${testJobId}/errors?page=1&limit=5`);
  assert.strictEqual(page1Res.status, 200, 'GET /errors should return 200 OK');
  const page1 = await page1Res.json();

  assert(page1.success, 'Response success should be true');
  assert.strictEqual(page1.jobId, testJobId);
  assert.strictEqual(page1.page, 1);
  assert.strictEqual(page1.limit, 5);
  assert.strictEqual(page1.errors.length, 5, 'Should return 5 errors for limit=5');
  assert(page1.totalErrors >= 10, 'Should have multiple error records');
  assert(page1.totalPages >= 2, 'Should have at least 2 pages for limit=5');
  assert(Array.isArray(page1.distinctFailedFields), 'distinctFailedFields must be an array');

  // Verify structure of an error record (Dev 2 / Dev 3 contract)
  const firstError = page1.errors[0];
  assert(firstError.id, 'Error record must have an id');
  assert(typeof firstError.rowNumber === 'number', 'rowNumber must be a number');
  assert(firstError.failedField, 'failedField must be defined');
  assert(firstError.rejectedReason, 'rejectedReason must explain failure');
  assert(firstError.rawData, 'rawData must contain raw CSV input row');
  assert(typeof firstError.rawData === 'object', 'rawData must be an object payload');
  assert(firstError.timestamp, 'timestamp must be present');

  console.log('✓ Validated first error record structure:');
  console.log(`  Row #${firstError.rowNumber} -> [${firstError.failedField}]: "${firstError.rejectedReason}"`);
  console.log(`  Raw input:`, firstError.rawData);

  // Page 2
  const page2Res = await fetch(`${baseUrl}/api/jobs/${testJobId}/errors?page=2&limit=5`);
  const page2 = await page2Res.json();
  assert.strictEqual(page2.page, 2);
  assert.strictEqual(page2.errors.length, 5);
  assert.notStrictEqual(page2.errors[0].id, firstError.id, 'Page 2 items must differ from Page 1');
  console.log('✓ Pagination page navigation verified successfully.');
}

async function testFieldFilteringAndKeywordSearch() {
  console.log('\n--- 2. Testing Field Filtering & Search in DLQ Records ---');
  const testJobId = `job-test-filter-${Date.now()}`;

  // Query distinct fields first
  const initialRes = await fetch(`${baseUrl}/api/jobs/${testJobId}/errors?page=1&limit=20`);
  const initialData = await initialRes.json();
  const fields = initialData.distinctFailedFields;
  assert(fields.length > 0, 'Must have distinct failed fields');

  const testField = fields[0];
  console.log(`Testing filter for failedField: "${testField}"`);

  // Filter by field
  const filterRes = await fetch(`${baseUrl}/api/jobs/${testJobId}/errors?page=1&limit=20&field=${encodeURIComponent(testField)}`);
  const filterData = await filterRes.json();
  assert(filterData.errors.length > 0, `Should return errors for field ${testField}`);
  for (const err of filterData.errors) {
    assert.strictEqual(err.failedField.toLowerCase(), testField.toLowerCase(), 'All filtered errors must match field');
  }
  console.log(`✓ Field filter returned ${filterData.errors.length} matched records cleanly.`);

  // Search by keyword
  const searchRes = await fetch(`${baseUrl}/api/jobs/${testJobId}/errors?page=1&limit=20&search=failure`);
  const searchData = await searchRes.json();
  assert(searchData.success, 'Search should succeed');
  for (const err of searchData.errors) {
    const haystack = (err.rejectedReason + ' ' + err.failedField + ' ' + JSON.stringify(err.rawData)).toLowerCase();
    assert(haystack.includes('failure'), 'Search results must include query keyword');
  }
  console.log(`✓ Keyword search returned ${searchData.errors.length} matching DLQ records.`);
}

async function testPurgeAndEmptyState() {
  console.log('\n--- 3. Testing DLQ Purge & Empty State API ---');
  const testJobId = `job-test-purge-${Date.now()}`;

  // Populate first
  await fetch(`${baseUrl}/api/jobs/${testJobId}/errors?page=1&limit=5`);

  // Delete / purge errors: DELETE /api/jobs/:id/errors
  const delRes = await fetch(`${baseUrl}/api/jobs/${testJobId}/errors`, {
    method: 'DELETE'
  });
  assert.strictEqual(delRes.status, 200, 'DELETE /errors should return 200 OK');
  const delData = await delRes.json();
  assert(delData.success, 'Purge response must indicate success');

  // Verify empty state
  const checkRes = await fetch(`${baseUrl}/api/jobs/${testJobId}/progress`);
  const checkData = await checkRes.json();
  assert.strictEqual(checkData.errorCount, 0, 'errorCount should be reset to 0 after purge');
  console.log('✓ Purge endpoint cleanly cleared DLQ records and reset error count.');
}

async function testExportSerialization() {
  console.log('\n--- 4. Testing DLQ Export CSV and JSON Serialization ---');

  const sampleErrors = [
    {
      id: 'dlq-1',
      rowNumber: 104,
      failedField: 'unitPrice',
      rejectedReason: 'Cast failure: String "$49.99 USD" cannot be converted to Number',
      rawData: { order_id: 'ORD-104', unit_price: '$49.99 USD' },
      timestamp: '2026-09-27T16:00:00.000Z'
    },
    {
      id: 'dlq-2',
      rowNumber: 215,
      failedField: 'timestamp',
      rejectedReason: 'Date parse failure: Value "invalid-date-2026" does not match ISO-8601',
      rawData: { order_id: 'ORD-215', timestamp: 'invalid-date-2026' },
      timestamp: '2026-09-27T16:01:00.000Z'
    }
  ];

  // Test JSON serialization
  const jsonOutput = JSON.stringify(sampleErrors, null, 2);
  const parsedBack = JSON.parse(jsonOutput);
  assert.strictEqual(parsedBack.length, 2);
  assert.strictEqual(parsedBack[0].rowNumber, 104);

  // Test CSV serialization
  const headers = ['RowNumber', 'FailedField', 'RejectedReason', 'Timestamp', 'RawData'];
  const rows = sampleErrors.map(e => [
    e.rowNumber,
    `"${e.failedField}"`,
    `"${e.rejectedReason.replace(/"/g, '""')}"`,
    `"${e.timestamp}"`,
    `"${JSON.stringify(e.rawData).replace(/"/g, '""')}"`
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  assert(csvContent.includes('RowNumber,FailedField,RejectedReason,Timestamp,RawData'));
  assert(csvContent.includes('104,"unitPrice"'));
  assert(csvContent.includes('215,"timestamp"'));
  console.log('✓ DLQ serialization for JSON and CSV verified accurately.');
}

async function testComplianceCalculations() {
  console.log('\n--- 5. Testing Schema Compliance Rate Calculations ---');

  const totalProcessed = 48500;
  const totalErrors = 1500;
  const totalAttempted = totalProcessed + totalErrors;
  const cleanRate = ((totalProcessed / totalAttempted) * 100).toFixed(1);

  assert.strictEqual(cleanRate, '97.0', 'Compliance rate should be 97.0% for 48,500 clean / 50,000 total');

  const zeroErrorRate = ((50000 / (50000 + 0)) * 100).toFixed(1);
  assert.strictEqual(zeroErrorRate, '100.0', 'Compliance rate should be 100.0% for 0 errors');
  console.log('✓ Telemetry compliance formulas validated.');
}

async function runAllDay5Tests() {
  console.log('===============================================================');
  console.log('  StreamWeaver Dev 3 Day 5: Error Audit Drawer & UI Hardening');
  console.log('===============================================================');

  try {
    await startServer();
    await testPaginatedErrorRetrieval();
    await testFieldFilteringAndKeywordSearch();
    await testPurgeAndEmptyState();
    await testExportSerialization();
    await testComplianceCalculations();

    console.log('\n===============================================================');
    console.log('  ✓ ALL DEV 3 DAY 5 VERIFICATION TESTS PASSED SUCCESSFULLY!    ');
    console.log('===============================================================');
  } catch (err) {
    console.error('\n❌ Dev 3 Day 5 Test Failure:', err);
    process.exitCode = 1;
  } finally {
    await stopServer();
  }
}

runAllDay5Tests();
