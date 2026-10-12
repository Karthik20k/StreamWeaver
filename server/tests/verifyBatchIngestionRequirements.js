'use strict';

const assert = require('node:assert');
const {
  DestinationBuffer,
  DLQBuffer,
  persistSandboxRejectedRecords,
  validateDocumentsAgainstSchema
} = require('../src/streams/batchIngestionStream');
const { StagingData, DeadLetterQueue, IngestionJob, TargetSchema } = require('../src/models');
const dbEventBus = require('../src/events/dbEventBus');

/**
 * Observable mock model for inspecting database operations
 */
function createSpyModel(name) {
  const operations = [];
  const insertedDocuments = [];

  return {
    modelName: name,
    schema: StagingData.schema,
    async bulkWrite(ops, options) {
      operations.push({ method: 'bulkWrite', ops, options, timestamp: Date.now() });
      for (const op of ops) {
        if (op.insertOne) {
          insertedDocuments.push(op.insertOne.document);
        }
      }
      return { ok: 1, insertedCount: ops.length };
    },
    async insertMany(docs, options) {
      operations.push({ method: 'insertMany', docs, options, timestamp: Date.now() });
      insertedDocuments.push(...docs);
      return docs;
    },
    getOperations() { return operations; },
    getInsertedDocuments() { return insertedDocuments; },
    reset() {
      operations.length = 0;
      insertedDocuments.length = 0;
    }
  };
}

/**
 * Test 1: Collection-level schema validation checks on final target documents before insertion
 */
async function testCollectionLevelSchemaValidation() {
  console.log('[Test 1] Collection-level schema validation checks on final target documents...');

  const stagingSpy = createSpyModel('StagingData');
  const dlqSpy = createSpyModel('DeadLetterQueue');

  // Custom TargetSchema with strict rules
  const targetSchemaDef = {
    name: 'ValidatedOrders',
    fields: [
      { name: 'orderId', type: 'String', constraints: { required: true } },
      { name: 'amount', type: 'Number', constraints: { required: true, min: 10 } }
    ]
  };
  const targetSchema = new TargetSchema(targetSchemaDef);

  const buffer = new DestinationBuffer({
    model: stagingSpy,
    dlqModel: dlqSpy,
    targetSchema,
    batchSize: 5,
    flushTimeoutMs: 1000,
    enableSchemaValidation: true
  });

  // Push 3 valid records and 2 invalid records (amount < 10 or missing orderId)
  await buffer.push({ rowNumber: 1, payload: { orderId: 'ORD_1', amount: 50 } }); // valid
  await buffer.push({ rowNumber: 2, payload: { orderId: 'ORD_2', amount: 3 } });  // invalid: amount < 10
  await buffer.push({ rowNumber: 3, payload: { orderId: 'ORD_3', amount: 100 } }); // valid
  await buffer.push({ rowNumber: 4, payload: { amount: 20 } });                     // invalid: missing orderId
  await buffer.push({ rowNumber: 5, payload: { orderId: 'ORD_5', amount: 75 } }); // valid

  await buffer.close();

  // Exactly 3 valid docs inserted into StagingData
  assert.strictEqual(stagingSpy.getOperations().length, 1, 'Exactly 1 bulkWrite should be executed for valid records');
  assert.strictEqual(stagingSpy.getOperations()[0].ops.length, 3, 'Only 3 valid records should be inserted');
  assert.strictEqual(buffer.cumulativeDocumentsCommitted, 3, 'Cumulative documents committed should equal 3');

  // Exactly 2 rejected docs routed to DLQ with full error context
  assert.strictEqual(dlqSpy.getOperations().length, 1, 'DLQ bulkWrite should be executed for rejected records');
  assert.strictEqual(dlqSpy.getOperations()[0].ops.length, 2, '2 rejected records routed to DLQ');

  const dlqDocs = dlqSpy.getInsertedDocuments();
  assert.strictEqual(dlqDocs[0].errorType, 'SCHEMA_VALIDATION_FAILED');
  assert.strictEqual(dlqDocs[0].rowNumber, 2);
  assert(dlqDocs[0].rejectedReason.includes('below minimum'));
  assert.strictEqual(dlqDocs[0].failedField, 'amount');
  assert(dlqDocs[0].stackTrace, 'Full stack trace must be captured');

  assert.strictEqual(dlqDocs[1].rowNumber, 4);
  assert(dlqDocs[1].rejectedReason.includes('required'));
  assert.strictEqual(dlqDocs[1].failedField, 'orderId');

  console.log('✓ Collection-level schema validation checks passed!');
}

/**
 * Test 2: Persist sandbox-rejected records received from Developer 1 into DLQ with full error traces
 */
async function testPersistSandboxRejectedRecords() {
  console.log('[Test 2] Persisting sandbox-rejected records from Developer 1 with full error traces...');

  const dlqSpy = createSpyModel('DeadLetterQueue');
  const dlqBuffer = new DLQBuffer({
    model: dlqSpy,
    jobId: 'job_sandbox_dev1',
    batchSize: 2
  });

  const sandboxError1 = {
    jobId: 'job_sandbox_dev1',
    rowNumber: 101,
    rawData: { rawText: 'DROP TABLE;' },
    error: new Error('Script execution timed out after 50ms in isolated-vm'),
    errorType: 'SANDBOX_TIMEOUT',
    sandboxError: { code: 'ERR_TIMEOUT', executionTimeMs: 52 },
    details: { scriptName: 'cleanse_order.js', memoryLimitMB: 128 }
  };

  const sandboxError2 = {
    jobId: 'job_sandbox_dev1',
    rowNumber: 102,
    rawData: { rawText: 'invalid syntax (((' },
    errorMessage: 'SyntaxError: Unexpected token ( at userCode.js:1:12',
    errorType: 'SANDBOX_SYNTAX_ERROR',
    stack: 'SyntaxError: Unexpected token (\n    at isolated-vm context:1:12',
    details: { line: 1, column: 12 }
  };

  await dlqBuffer.pushSandboxRejected(sandboxError1);
  await dlqBuffer.pushSandboxRejected(sandboxError2);
  await dlqBuffer.close();

  assert.strictEqual(dlqSpy.getOperations().length, 1);
  const dlqDocs = dlqSpy.getInsertedDocuments();
  assert.strictEqual(dlqDocs.length, 2);

  // Validate error trace completeness
  assert.strictEqual(dlqDocs[0].errorType, 'SANDBOX_TIMEOUT');
  assert.strictEqual(dlqDocs[0].rowNumber, 101);
  assert(dlqDocs[0].rejectedReason.includes('isolated-vm'));
  assert(dlqDocs[0].stackTrace, 'Stack trace must be present');
  assert.strictEqual(dlqDocs[0].details.sandboxSource, 'Developer1.IsolatedVmSandbox');

  assert.strictEqual(dlqDocs[1].errorType, 'SANDBOX_SYNTAX_ERROR');
  assert(dlqDocs[1].stackTrace.includes('isolated-vm context'));

  // Also test direct helper persistSandboxRejectedRecords
  dlqSpy.reset();
  const directResult = await persistSandboxRejectedRecords([sandboxError1], {
    model: dlqSpy,
    jobId: 'direct_sandbox_job'
  });
  assert.strictEqual(directResult.insertedCount, 1);
  assert.strictEqual(dlqSpy.getInsertedDocuments()[0].errorType, 'SANDBOX_TIMEOUT');

  console.log('✓ Sandbox-rejected records persisted with full error traces verified!');
}

/**
 * Test 3: Compound indexes on { jobId: 1, rowNumber: 1 } and { jobId: 1, createdAt: -1 }
 */
async function testCompoundIndexesForPagination() {
  console.log('[Test 3] Verifying compound indexes for Developer 3 low-latency pagination...');

  const stagingIndexes = StagingData.schema.indexes();
  const dlqIndexes = DeadLetterQueue.schema.indexes();

  // Helper to find index by fields
  const hasIndex = (indexes, expectedDef) => {
    return indexes.some(([fields]) => {
      const keys = Object.keys(fields);
      const expectedKeys = Object.keys(expectedDef);
      if (keys.length !== expectedKeys.length) return false;
      return keys.every(k => fields[k] === expectedDef[k]);
    });
  };

  // 1. Verify StagingData indexes
  assert(
    hasIndex(stagingIndexes, { jobId: 1, rowNumber: 1 }),
    'StagingData must have compound index on { jobId: 1, rowNumber: 1 }'
  );
  assert(
    hasIndex(stagingIndexes, { jobId: 1, createdAt: -1 }),
    'StagingData must have compound index on { jobId: 1, createdAt: -1 }'
  );

  // 2. Verify DeadLetterQueue indexes
  assert(
    hasIndex(dlqIndexes, { jobId: 1, rowNumber: 1 }),
    'DeadLetterQueue must have compound index on { jobId: 1, rowNumber: 1 }'
  );
  assert(
    hasIndex(dlqIndexes, { jobId: 1, createdAt: -1 }),
    'DeadLetterQueue must have compound index on { jobId: 1, createdAt: -1 }'
  );

  console.log('✓ Compound indexes on { jobId: 1, rowNumber: 1 } and { jobId: 1, createdAt: -1 } confirmed!');
}

/**
 * Test 4: Calculate database-level performance indicators:
 *  - write duration per 5,000-record batch
 *  - cumulative documents committed
 *  - database I/O latency
 */
async function testDatabasePerformanceIndicators() {
  console.log('[Test 4] Calculating database-level performance indicators...');

  const spyModel = createSpyModel('StagingData');
  let lastFlushedStats = null;

  const buffer = new DestinationBuffer({
    model: spyModel,
    batchSize: 50,
    onBatchFlushed: (stats) => {
      lastFlushedStats = stats;
    }
  });

  // Push 50 records to trigger batch flush
  for (let i = 1; i <= 50; i++) {
    await buffer.push({ rowNumber: i, payload: { key: `item_${i}` } });
  }

  await buffer.close();

  assert(lastFlushedStats, 'Batch stats must be emitted');
  assert.strictEqual(typeof lastFlushedStats.writeDurationMs, 'number', 'writeDurationMs must be numeric');
  assert(lastFlushedStats.writeDurationMs >= 0, 'writeDurationMs must be >= 0');

  assert.strictEqual(typeof lastFlushedStats.dbIoLatencyMs, 'number', 'dbIoLatencyMs must be numeric');
  assert(lastFlushedStats.dbIoLatencyMs >= 0, 'dbIoLatencyMs must be >= 0');

  assert.strictEqual(lastFlushedStats.cumulativeDocumentsCommitted, 50, 'cumulativeDocumentsCommitted must equal 50');
  assert.strictEqual(lastFlushedStats.batchSize, 50);

  const perfIndicators = buffer.getDatabasePerformanceIndicators();
  assert.strictEqual(perfIndicators.cumulativeDocumentsCommitted, 50);
  assert.strictEqual(typeof perfIndicators.dbIoLatencyMs, 'number');
  assert.strictEqual(typeof perfIndicators.writeDurationMs, 'number');
  assert.strictEqual(perfIndicators.totalBatchesCommitted, 1);

  console.log('✓ Database-level performance indicators calculated successfully!');
}

/**
 * Test 5: Forward database write metrics to internal event bus for client WebSocket broadcasting
 */
async function testForwardMetricsToEventBusAndWebSocket() {
  console.log('[Test 5] Forwarding database write metrics to internal event bus & WebSocket broadcasting...');

  const spyModel = createSpyModel('StagingData');
  const metricsReceived = [];

  // 1. Subscribe to dbEventBus write metrics
  const unsubscribe = dbEventBus.onWriteMetrics((metrics) => {
    metricsReceived.push(metrics);
  });

  // 2. Attach mock WebSocket server to verify broadcasting
  const wsBroadcasted = [];
  const mockWebSocketServer = {
    emit(event, data) {
      wsBroadcasted.push({ event, data });
    }
  };
  dbEventBus.attachWebSocketServer(mockWebSocketServer);

  const buffer = new DestinationBuffer({
    model: spyModel,
    jobId: 'job_ws_telemetry',
    batchSize: 20,
    eventBus: dbEventBus
  });

  for (let i = 1; i <= 20; i++) {
    await buffer.push({ rowNumber: i, payload: { value: i } });
  }
  await buffer.close();

  unsubscribe();

  // Verify internal event bus received the metrics
  assert(metricsReceived.length >= 1, 'Event bus must receive write metrics');
  const latestMetric = metricsReceived[0];
  assert.strictEqual(latestMetric.jobId, 'job_ws_telemetry');
  assert.strictEqual(latestMetric.cumulativeDocumentsCommitted, 20);
  assert.strictEqual(typeof latestMetric.writeDurationMs, 'number');
  assert.strictEqual(typeof latestMetric.dbIoLatencyMs, 'number');

  // Verify WebSocket server received the broadcast
  assert(wsBroadcasted.length >= 1, 'WebSocket server must receive broadcasted metrics');
  assert.strictEqual(wsBroadcasted[0].event, 'db:write:metrics');
  assert.strictEqual(wsBroadcasted[0].data.jobId, 'job_ws_telemetry');
  assert.strictEqual(wsBroadcasted[0].data.cumulativeDocumentsCommitted, 20);

  console.log('✓ Write metrics forwarded to event bus and WebSocket server verified!');
}

/**
 * Test 6: Periodically update parent IngestionJob record without inducing write-lock contention
 */
async function testPeriodicContentionFreeJobUpdates() {
  console.log('[Test 6] Periodically update parent IngestionJob without write-lock contention...');

  // Mock IngestionJob model tracking atomic updates
  const atomicUpdates = [];
  const mockJobModel = {
    async updateProgressAtomic(jobId, deltas) {
      atomicUpdates.push({ jobId, deltas, timestamp: Date.now() });
      return { acknowledged: true, modifiedCount: 1 };
    },
    getOperations() { return atomicUpdates; }
  };

  const spyModel = createSpyModel('StagingData');
  const buffer = new DestinationBuffer({
    model: spyModel,
    jobModel: mockJobModel,
    jobId: 'job_contention_free_123',
    batchSize: 10,
    jobUpdateThrottleMs: 200 // 200ms throttle window
  });

  // Flush 3 quick batches (30 records)
  for (let i = 1; i <= 30; i++) {
    await buffer.push({ rowNumber: i, payload: { num: i } });
  }

  // Close buffer to ensure all pending deltas are committed
  await buffer.close();

  // Atomic updates must be called
  assert(atomicUpdates.length >= 1, 'Atomic updates must be called on IngestionJob');
  const totalProcessedDelta = atomicUpdates.reduce((sum, u) => sum + u.deltas.processedDelta, 0);
  assert.strictEqual(totalProcessedDelta, 30, 'Total processed delta across atomic updates must equal 30');
  assert.strictEqual(atomicUpdates[0].jobId, 'job_contention_free_123');

  // Also test IngestionJob.updateProgressAtomic static method exists on real model
  assert.strictEqual(
    typeof IngestionJob.updateProgressAtomic,
    'function',
    'IngestionJob model must expose updateProgressAtomic static method'
  );

  console.log('✓ Contention-free periodic IngestionJob updates verified!');
}

async function runAll() {
  try {
    console.log('================================================================');
    console.log('    VERIFYING ALL 6 STREAMWEAVER BATCH INGESTION REQUIREMENTS   ');
    console.log('================================================================\n');

    await testCollectionLevelSchemaValidation();
    await testPersistSandboxRejectedRecords();
    await testCompoundIndexesForPagination();
    await testDatabasePerformanceIndicators();
    await testForwardMetricsToEventBusAndWebSocket();
    await testPeriodicContentionFreeJobUpdates();

    console.log('\n================================================================');
    console.log('       ALL 6 BATCH INGESTION REQUIREMENTS SUCCESSFULLY VERIFIED! ');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ Requirement Verification Failure:', err);
    process.exit(1);
  }
}

runAll();
