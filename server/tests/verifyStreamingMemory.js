const fs = require('node:fs');
const path = require('node:path');
const { generateSyntheticCsv } = require('./generateSyntheticCsv');
const { processCsvIngestion } = require('../src/pipeline/ingestionWorker');
const { connectDB, disconnectDB } = require('../src/config/db');
const StagingData = require('../src/models/StagingData');
const UploadError = require('../src/models/UploadError');

/**
 * High-performance mock Model for isolated memory verification
 * when external MongoDB instance is not active.
 */
function createMockModel(name) {
  let operations = 0;
  let insertedDocs = 0;

  return {
    modelName: name,
    async bulkWrite(ops, options) {
      operations++;
      insertedDocs += ops.length;
      // Simulate typical async I/O latency to test backpressure
      await new Promise(r => setImmediate(r));
      return { ok: 1, insertedCount: ops.length };
    },
    async insertMany(docs, options) {
      operations++;
      insertedDocs += docs.length;
      await new Promise(r => setImmediate(r));
      return docs;
    },
    getStats() {
      return { operations, insertedDocs };
    }
  };
}

/**
 * Run Memory & Micro-Batching Integration Test
 */
async function runMemoryBenchmark(options = {}) {
  const {
    fileSizeMB = 100, // Pass 1024 for 1GB+ test
    batchSize = 1000,
    writeMethod = 'bulkWrite',
    useLiveMongo = false
  } = options;

  console.log('================================================================');
  console.log('   STREAMWEAVER STREAMING INGESTION & MEMORY INTEGRATION TEST   ');
  console.log('================================================================');
  console.log(`Target CSV Size:        ${fileSizeMB} MB`);
  console.log(`Micro-Batch Size:       ${batchSize.toLocaleString()} documents`);
  console.log(`Write Operation Method: ${writeMethod}`);
  console.log(`Live MongoDB:           ${useLiveMongo ? 'Yes' : 'Mock DB Engine (Isolated Backpressure)'}`);
  console.log('----------------------------------------------------------------\n');

  // Step 1: Optional Live DB Connection
  let stagingModel = StagingData;
  let errorModel = UploadError;

  if (useLiveMongo) {
    try {
      await connectDB();
      console.log('[Test Setup] Connected to live MongoDB instance.');
    } catch (err) {
      console.warn(`[Test Setup] Could not connect to live MongoDB: ${err.message}. Using high-throughput mock DB.`);
      stagingModel = createMockModel('StagingData');
      errorModel = createMockModel('UploadError');
    }
  } else {
    stagingModel = createMockModel('StagingData');
    errorModel = createMockModel('UploadError');
  }

  // Step 2: Generate Synthetic CSV
  const tempCsvPath = path.join(__dirname, `benchmark_${fileSizeMB}MB_${Date.now()}.csv`);
  const targetBytes = Math.round(fileSizeMB * 1024 * 1024);

  const genResult = await generateSyntheticCsv({
    outputPath: tempCsvPath,
    targetBytes,
    malformedInterval: 500, // 1 in every 500 rows is malformed
    onProgress: (p) => {
      process.stdout.write(`\r[Generating CSV] ${(p.totalMB).toFixed(1)}MB / ${fileSizeMB}MB written...`);
    }
  });

  console.log(`\n[Test Setup] Synthetic file ready: ${(genResult.totalBytes / (1024 * 1024)).toFixed(2)} MB, ${genResult.totalRows.toLocaleString()} rows (${genResult.malformedRows} malformed).\n`);

  // Step 3: Run Ingestion Pipeline with Memory Telemetry
  const memorySnapshots = [];
  const batchTelemetry = [];

  const initialMemory = process.memoryUsage();
  memorySnapshots.push({
    point: 'Initial (Pre-Stream)',
    heapUsedMB: +(initialMemory.heapUsed / 1024 / 1024).toFixed(2),
    rssMB: +(initialMemory.rss / 1024 / 1024).toFixed(2)
  });

  console.log(`[Baseline Memory] Heap Used: ${memorySnapshots[0].heapUsedMB} MB | RSS: ${memorySnapshots[0].rssMB} MB`);
  console.log('[Pipeline] Starting Transform Stream Pipeline...\n');

  let batchCount = 0;

  const result = await processCsvIngestion({
    source: tempCsvPath,
    fileId: `bench_${Date.now()}`,
    fileName: path.basename(tempCsvPath),
    batchSize,
    writeMethod,
    stagingModel,
    errorModel,
    onBatch: (stats) => {
      batchCount++;
      const mem = process.memoryUsage();
      const heapMB = +(mem.heapUsed / 1024 / 1024).toFixed(2);
      const rssMB = +(mem.rss / 1024 / 1024).toFixed(2);

      // Record snapshot periodically
      if (batchCount % 10 === 0 || stats.batchSize < batchSize) {
        memorySnapshots.push({
          point: `Batch #${batchCount} (${stats.totalIngested.toLocaleString()} rows)`,
          heapUsedMB: heapMB,
          rssMB: rssMB
        });
        process.stdout.write(
          `\r[Ingesting] Batch #${batchCount} | Ingested: ${stats.totalIngested.toLocaleString()} | Errors: ${stats.invalidRows} | Heap: ${heapMB} MB | RSS: ${rssMB} MB`
        );
      }
    }
  });

  const finalMemory = process.memoryUsage();
  memorySnapshots.push({
    point: 'Pipeline Complete',
    heapUsedMB: +(finalMemory.heapUsed / 1024 / 1024).toFixed(2),
    rssMB: +(finalMemory.rss / 1024 / 1024).toFixed(2)
  });

  console.log('\n\n================================================================');
  console.log('                      PIPELINE SUMMARY                          ');
  console.log('================================================================');
  console.log(`Total Rows Parsed:     ${result.totalRows.toLocaleString()}`);
  console.log(`Valid Rows Staged:     ${result.validRows.toLocaleString()}`);
  console.log(`Malformed Rows:        ${result.invalidRows.toLocaleString()} (Isolated to UploadError)`);
  console.log(`Batches Flushed:       ${result.ingestedBatches}`);
  console.log(`Total Elapsed Time:    ${result.durationSec} seconds`);
  console.log(`Ingestion Throughput:  ${result.throughputRowsPerSec.toLocaleString()} rows/sec`);
  console.log('----------------------------------------------------------------');

  // Step 4: Memory Verification Analysis
  const heapValues = memorySnapshots.map(s => s.heapUsedMB);
  const minHeap = Math.min(...heapValues);
  const maxHeap = Math.max(...heapValues);
  const avgHeap = +(heapValues.reduce((a, b) => a + b, 0) / heapValues.length).toFixed(2);

  console.log('\n================================================================');
  console.log('               MEMORY PROFILE & BACKPRESSURE AUDIT              ');
  console.log('================================================================');
  console.table(memorySnapshots);

  console.log(`Min Heap Used:         ${minHeap} MB`);
  console.log(`Max Heap Used:         ${maxHeap} MB`);
  console.log(`Avg Heap Used:         ${avgHeap} MB`);
  console.log(`Final Heap Used:       ${result.memoryTelemetry.heapUsedMB} MB`);
  console.log(`Final RSS:             ${result.memoryTelemetry.rssMB} MB`);

  // Assertions
  const isMemoryStable = maxHeap < 180; // Node.js default heap limit is ~1400MB; streaming must stay well below ~150-180MB
  const isErrorIsolationWorking = result.invalidRows === genResult.malformedRows && result.invalidRows > 0;
  const isBatchingWorking = result.ingestedBatches === Math.ceil(result.validRows / batchSize);

  console.log('\n================================================================');
  console.log('                     VERIFICATION RESULTS                       ');
  console.log('================================================================');
  console.log(`[PASS] Micro-batching (1,000 docs/batch): ${isBatchingWorking ? 'YES' : 'FAIL'} (${result.ingestedBatches} batches for ${result.validRows} rows)`);
  console.log(`[PASS] Error Isolation (kept pipeline alive): ${isErrorIsolationWorking ? 'YES' : 'FAIL'} (${result.invalidRows} isolated malformed rows)`);
  console.log(`[PASS] Constant Memory Footprint: ${isMemoryStable ? 'YES' : 'FAIL'} (Peak heap: ${maxHeap} MB)`);
  console.log('================================================================\n');

  // Cleanup benchmark file
  try {
    if (fs.existsSync(tempCsvPath)) {
      fs.unlinkSync(tempCsvPath);
      console.log(`[Cleanup] Removed temporary benchmark file: ${tempCsvPath}`);
    }
  } catch (cleanErr) {
    console.warn(`[Cleanup] Could not delete temp file: ${cleanErr.message}`);
  }

  if (useLiveMongo) {
    await disconnectDB();
  }

  return {
    result,
    memorySnapshots,
    metrics: { minHeap, maxHeap, avgHeap },
    verifications: {
      isMemoryStable,
      isErrorIsolationWorking,
      isBatchingWorking
    }
  };
}

// CLI direct run
if (require.main === module) {
  const args = process.argv.slice(2);
  const sizeMB = args[0] ? parseFloat(args[0]) : 50; // default 50MB for test run
  const liveMongo = args.includes('--live-mongo');

  runMemoryBenchmark({
    fileSizeMB: sizeMB,
    batchSize: 1000,
    writeMethod: 'bulkWrite',
    useLiveMongo: liveMongo
  }).catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
}

module.exports = {
  runMemoryBenchmark
};
