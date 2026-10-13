import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import Papa from 'papaparse';
import { calculateColumnWidths, inferColumnTypes } from '../utils/columnAutoSizer.js';
import { SAMPLE_DATASETS } from '../utils/sampleDatasets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverEntryPath = path.resolve(__dirname, '../../../server/src/index.js');

async function testSliceParsingBenchmark() {
  const headers = ['transaction_id', 'account_id', 'timestamp', 'operation', 'amount', 'currency', 'status', 'latency_ms', 'origin_ip'];
  const lines = [headers.join(',')];
  for (let i = 1; i <= 1000; i++) {
    lines.push(`TX-${100000 + i},ACC-${8000 + (i % 200)},2026-09-17T18:00:00Z,AUTHORIZE,${(25.5 + (i * 18.25) % 1500).toFixed(2)},USD,SUCCESS,${12 + (i % 80)},192.168.1.${i % 250}`);
  }
  const csvContent = lines.join('\n');

  const t0 = performance.now();
  const parsed = Papa.parse(csvContent, {
    header: true,
    preview: 1000,
    skipEmptyLines: 'greedy',
    dynamicTyping: true
  });
  const t1 = performance.now();
  const duration = t1 - t0;

  if (parsed.data.length !== 1000) {
    throw new Error(`Expected 1000 preview rows, got ${parsed.data.length}`);
  }
  if (parsed.meta.fields.length !== headers.length) {
    throw new Error(`Expected ${headers.length} headers, got ${parsed.meta.fields.length}`);
  }
  if (duration >= 300) {
    throw new Error(`Performance SLA exceeded: ${duration.toFixed(2)}ms >= 300ms`);
  }
}

function testColumnAutoSizerAndTypes() {
  const sample = SAMPLE_DATASETS[0].generateContent();
  const parsed = Papa.parse(sample.content, {
    header: true,
    preview: 50,
    skipEmptyLines: 'greedy',
    dynamicTyping: true
  });

  const sizing = calculateColumnWidths(parsed.meta.fields, parsed.data, {
    minWidth: 120,
    maxWidth: 320,
    charWidthPx: 8,
    paddingPx: 30,
    indexColWidth: 64
  });

  if (sizing.columnWidths.length !== parsed.meta.fields.length) {
    throw new Error('Column width count mismatch');
  }
  if (sizing.indexColWidth !== 64 || sizing.getColumnWidth(0) !== 64) {
    throw new Error('Index column width failed');
  }
  if (sizing.getColumnWidth(1) !== sizing.columnWidths[0]) {
    throw new Error('Column width accessor failed');
  }

  const types = inferColumnTypes(parsed.meta.fields, parsed.data);
  if (!types['order_id'] || !types['unit_price'] || !types['timestamp']) {
    throw new Error('Column type inference failed');
  }
  if (types['unit_price'] !== 'num') {
    throw new Error(`Expected unit_price to be num, got ${types['unit_price']}`);
  }
  if (types['timestamp'] !== 'date') {
    throw new Error(`Expected timestamp to be date, got ${types['timestamp']}`);
  }
}

function testGridFilteringAndSorting() {
  const rows = [
    { id: 'TX-1', user: 'Alice', amount: 50.5, status: 'COMPLETED' },
    { id: 'TX-2', user: 'Bob', amount: 15.0, status: 'PENDING' },
    { id: 'TX-3', user: 'Charlie', amount: 200.0, status: 'COMPLETED' },
    { id: 'TX-4', user: 'Alice', amount: 80.25, status: 'FAILED' }
  ];

  const aliceFiltered = rows.filter((r) =>
    Object.values(r).some((v) => String(v).toLowerCase().includes('alice'))
  );
  if (aliceFiltered.length !== 2) {
    throw new Error(`Expected 2 filtered rows for Alice, got ${aliceFiltered.length}`);
  }

  const sortedAsc = [...rows].sort((a, b) => a.amount - b.amount);
  if (sortedAsc[0].amount !== 15.0 || sortedAsc[sortedAsc.length - 1].amount !== 200.0) {
    throw new Error('Ascending sort failed');
  }

  const sortedDesc = [...rows].sort((a, b) => b.amount - a.amount);
  if (sortedDesc[0].amount !== 200.0 || sortedDesc[sortedDesc.length - 1].amount !== 15.0) {
    throw new Error('Descending sort failed');
  }
}

function testSampleDatasetsIntegrity() {
  for (const ds of SAMPLE_DATASETS) {
    const generated = ds.generateContent();
    const lines = generated.content.split('\n');
    if (lines.length < 1000) {
      throw new Error(`Dataset ${ds.id} produced insufficient rows: ${lines.length}`);
    }
  }
}

async function testBackendStreamingUpload() {
  const appModule = await import(pathToFileURL(serverEntryPath).href);
  const app = appModule.default || appModule;

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const boundary = '----WebKitFormBoundaryStreamWeaverTest';
    const csvContent = 'id,product,quantity,unit_price\n101,Widget,5,19.99\n102,Gadget,2,49.50\n';
    const fileBytes = Buffer.from(csvContent, 'utf-8');

    const prefix = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="sample_stream_upload.csv"\r\n` +
      `Content-Type: text/csv\r\n\r\n`
    );
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
    const fullPayload = Buffer.concat([prefix, fileBytes, suffix]);

    const res = await fetch(`http://localhost:${port}/api/upload/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullPayload.length.toString()
      },
      body: fullPayload
    });

    if (res.status !== 200) {
      const errText = await res.text();
      throw new Error(`Upload endpoint returned status ${res.status}: ${errText}`);
    }

    const data = await res.json();
    if (!data.success || !data.uploadId) {
      throw new Error(`Upload response invalid: ${JSON.stringify(data)}`);
    }

    const statusRes = await fetch(`http://localhost:${port}/api/upload/status/${data.uploadId}`);
    if (statusRes.status !== 200) {
      throw new Error(`Status endpoint check failed with status ${statusRes.status}`);
    }
    const statusData = await statusRes.json();
    if (!statusData.exists || statusData.diskBytes !== fileBytes.length) {
      throw new Error(`Status data diskBytes mismatch: expected ${fileBytes.length}, got ${statusData.diskBytes}`);
    }

    if (fs.existsSync(data.path)) {
      fs.unlinkSync(data.path);
    }
  } finally {
    server.close();
  }
}

process.env.NODE_ENV = 'test';

async function runAll() {
  await testSliceParsingBenchmark();
  testColumnAutoSizerAndTypes();
  testGridFilteringAndSorting();
  testSampleDatasetsIntegrity();
  await testBackendStreamingUpload();
  console.log('Virtualization and streaming verification tests passed successfully.');
  process.exit(0);
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
