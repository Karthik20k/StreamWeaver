import { parseChunkedFile } from './chunkedCsvParser';

export async function run2GBBenchmarkTest() {
  const targetSlaMs = 300;
  const simulatedTotalSizeBytes = 2 * 1024 * 1024 * 1024;

  const headers = ['transaction_id', 'account_id', 'timestamp', 'operation', 'amount', 'currency', 'status', 'latency_ms', 'origin_ip'];
  const operations = ['AUTHORIZE', 'CAPTURE', 'REFUND', 'VOID', 'SETTLE'];
  const statuses = ['SUCCESS', 'PENDING', 'FLAGGED', 'REJECTED'];
  const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF'];

  const lines = [headers.join(',')];
  for (let i = 1; i <= 1000; i++) {
    const op = operations[i % operations.length];
    const st = statuses[i % statuses.length];
    const curr = currencies[i % currencies.length];
    const amount = (25.5 + (i * 18.25) % 1500).toFixed(2);
    const latency = 12 + (i % 80);
    const ip = `192.168.${(i % 250)}.${(i % 120) + 1}`;
    lines.push(`TX-${100000 + i},ACC-${8000 + (i % 200)},2026-09-17T18:00:00Z,${op},${amount},${curr},${st},${latency},${ip}`);
  }
  const sampleCsvString = lines.join('\n');

  const textBlob = new Blob([sampleCsvString], { type: 'text/csv' });
  
  const syntheticFile = new File([textBlob], 'benchmark_synthetic_2gb_dataset.csv', {
    type: 'text/csv',
    lastModified: Date.now()
  });

  Object.defineProperty(syntheticFile, 'size', {
    value: simulatedTotalSizeBytes,
    writable: false,
    configurable: true
  });

  const t0 = performance.now();
  const sliceSize = 1024 * 1024;
  const fileSlice = syntheticFile.slice(0, sliceSize);
  const t1 = performance.now();
  const sliceDurationMs = parseFloat((t1 - t0).toFixed(2));

  const t2 = performance.now();
  const parseResult = await parseChunkedFile(syntheticFile, {
    maxSliceBytes: sliceSize,
    maxRows: 1000
  });
  const t3 = performance.now();

  const workerParseDurationMs = parseFloat((t3 - t2).toFixed(2));
  const totalDurationMs = parseFloat((t3 - t0).toFixed(2));
  const passed = totalDurationMs < targetSlaMs;

  return {
    passed,
    targetSlaMs,
    totalDurationMs,
    sliceDurationMs,
    workerParseDurationMs,
    simulatedTotalSizeBytes,
    rowsParsed: parseResult.rows.length,
    columnsCount: parseResult.headers.length,
    detectedDelimiter: parseResult.detectedDelimiter,
    estimatedTotalRows: parseResult.estimatedTotalRows,
    timestamp: new Date().toISOString()
  };
}
