process.env.NODE_ENV = 'test';

import assert from 'assert';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import Express server for live streaming endpoint verification
const serverEntryPath = path.resolve(__dirname, '../../../server/src/index.js');
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

console.log('======================================================================');
console.log('  StreamWeaver - Developer 3 Day 15 Verification Suite (Part 3 of 3)');
console.log('  Streaming CSV Export Endpoint & Ingestion Dashboard Integration');
console.log('======================================================================');

async function testStreamingCsvExportEndpoint() {
  console.log('\n--- 1. Testing Developer 2 Streaming Error Export Endpoint (/api/jobs/:id/errors/export) ---');

  const testJobId = `job-export-test-${Date.now()}`;

  // 1.1 First trigger job creation
  const createRes = await fetch(`${baseUrl}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: testJobId,
      fileName: 'ecommerce_stream.csv',
      targetCollection: 'ecommerce_orders',
      estimatedRows: 25000
    })
  });
  assert.strictEqual(createRes.status, 201, 'Job must be created with 201');

  // 1.2 Fetch the streaming CSV export
  const exportRes = await fetch(`${baseUrl}/api/jobs/${testJobId}/errors/export`);
  assert.strictEqual(exportRes.status, 200, 'GET /errors/export must return 200 OK');

  const contentType = exportRes.headers.get('content-type') || '';
  const contentDisposition = exportRes.headers.get('content-disposition') || '';
  const transferEncoding = exportRes.headers.get('transfer-encoding') || '';

  assert.ok(contentType.includes('text/csv'), `Content-Type must be text/csv, received: ${contentType}`);
  assert.ok(contentDisposition.includes('attachment'), `Content-Disposition must be attachment, received: ${contentDisposition}`);
  assert.ok(contentDisposition.includes(testJobId), `Filename in Content-Disposition must contain jobId`);
  assert.strictEqual(transferEncoding, 'chunked', `Transfer-Encoding must be chunked for streaming export`);
  console.log('✓ Verified streaming HTTP headers (text/csv, attachment, chunked transfer)');

  // 1.3 Verify streamed CSV content
  const csvText = await exportRes.text();
  const lines = csvText.trim().split(/\r?\n/);

  assert.ok(lines.length >= 2, 'CSV must contain at least header and one data row');
  const header = lines[0];
  assert.strictEqual(
    header,
    'LineNumber,FailedColumn,ErrorCategory,ExecutionTimeMs,ExceptionMessage,Timestamp,RawPayload',
    'CSV header must match standard export schema'
  );
  console.log(`✓ CSV Header matches specification: ${header}`);

  // 1.4 Validate data row escaping and structure
  const firstDataRow = lines[1];
  assert.ok(firstDataRow.includes(','), 'Data row must contain comma-separated values');
  assert.ok(firstDataRow.includes('dlq') || firstDataRow.includes('order_id') || firstDataRow.includes('Cast failure') || firstDataRow.includes('VALIDATION_THROW'), 'Data row must contain error details');
  console.log(`✓ Streamed record verified: ${firstDataRow.slice(0, 80)}...`);
}

async function testDownloadButtonAndClientExportContract() {
  console.log('\n--- 2. Testing Download Button & Client-Side Export Integration ---');

  const inspectorPath = path.resolve(__dirname, '../components/ingestion/FailedRowsInspector.jsx');
  assert(fs.existsSync(inspectorPath), 'FailedRowsInspector.jsx must exist');
  const code = fs.readFileSync(inspectorPath, 'utf8');

  // 2.1 Verify DownloadIcon import
  assert(code.includes('DownloadIcon'), 'FailedRowsInspector must import DownloadIcon');
  console.log('✓ DownloadIcon imported');

  // 2.2 Verify Streaming endpoint connection
  assert(code.includes('/errors/export'), 'handleDownloadCsv must point to /api/jobs/:id/errors/export');
  assert(code.includes('handleDownloadCsv'), 'Component must define handleDownloadCsv function');
  console.log('✓ handleDownloadCsv wired to streaming endpoint /api/jobs/:id/errors/export');

  // 2.3 Verify Client-Side Fallback Generator
  assert(code.includes('text/csv;charset=utf-8'), 'Must provide client-side fallback with CSV mime type');
  assert(code.includes("'LineNumber', 'FailedColumn', 'ErrorCategory'"), 'Fallback must declare CSV header fields');
  console.log('✓ Resilient client-side CSV generator fallback verified');

  // 2.4 Verify Button rendering
  assert(code.includes('Download Error Log (CSV)'), 'Must render button with text "Download Error Log (CSV)"');
  assert(code.includes('download-error-log-btn'), 'Must attach .download-error-log-btn class');
  assert(code.includes('isExporting'), 'Must manage isExporting state');
  console.log('✓ Download Error Log (CSV) button and loading state verified');
}

async function testIngestionDashboardEmbedding() {
  console.log('\n--- 3. Testing Embedding Beneath Progress Dashboard (IngestionDashboardStage.jsx) ---');

  const stagePath = path.resolve(__dirname, '../components/ingestion/IngestionDashboardStage.jsx');
  assert(fs.existsSync(stagePath), 'IngestionDashboardStage.jsx must exist');
  const stageCode = fs.readFileSync(stagePath, 'utf8');

  // 3.1 Verify Import
  assert(stageCode.includes("import { FailedRowsInspector } from './FailedRowsInspector'"), 'IngestionDashboardStage must import FailedRowsInspector');
  console.log('✓ FailedRowsInspector imported into IngestionDashboardStage');

  // 3.2 Verify JSX Embedding
  assert(stageCode.includes('<FailedRowsInspector'), 'IngestionDashboardStage must render <FailedRowsInspector>');
  assert(stageCode.includes('jobId={jobId}'), 'FailedRowsInspector must receive jobId prop');
  assert(stageCode.includes('liveErrors={recentErrors}'), 'FailedRowsInspector must receive live recentErrors buffer');
  assert(stageCode.includes('dashboard-failed-rows-inspector'), 'FailedRowsInspector must have dashboard-failed-rows-inspector class');
  console.log('✓ <FailedRowsInspector> embedded beneath progress dashboard with live error feed');
}

async function testCssStylingForPart3() {
  console.log('\n--- 4. Testing CSS Styling for Download Button & Dashboard Embedding ---');

  const cssPath = path.resolve(__dirname, '../styles/ingestion.css');
  assert(fs.existsSync(cssPath), 'ingestion.css must exist');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert(css.includes('.download-error-log-btn'), 'CSS must define .download-error-log-btn');
  assert(css.includes('.dashboard-failed-rows-inspector'), 'CSS must define .dashboard-failed-rows-inspector');
  assert(css.includes('linear-gradient'), 'download-error-log-btn must feature cyber gradient');
  console.log('✓ CSS styling for export button and dashboard integration verified');
}

async function runAll() {
  try {
    await startServer();
    await testStreamingCsvExportEndpoint();
    await testDownloadButtonAndClientExportContract();
    await testIngestionDashboardEmbedding();
    await testCssStylingForPart3();

    console.log('\n======================================================================');
    console.log('  ALL DEV 3 DAY 15 PART 3 VERIFICATION TESTS PASSED (100%)');
    console.log('======================================================================\n');
  } catch (err) {
    console.error('\n❌ Test failure:', err);
    process.exit(1);
  } finally {
    await stopServer();
  }
}

runAll();
