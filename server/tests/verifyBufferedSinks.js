const assert = require('node:assert');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { DestinationBuffer, DLQBuffer } = require('../src/streams/batchIngestionStream');
const { DeadLetterQueue, StagingData } = require('../src/models');

/**
 * Creates an observable mock model to inspect bulkWrite and insertMany operations
 */
function createSpyModel(name) {
  const operations = [];
  const insertedDocuments = [];

  return {
    modelName: name,
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
    getOperations() {
      return operations;
    },
    getInsertedDocuments() {
      return insertedDocuments;
    },
    reset() {
      operations.length = 0;
      insertedDocuments.length = 0;
    }
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function testDestinationBufferThreshold() {
  console.log('[Test 1] DestinationBuffer: Gathers 1,000 clean records before bulkWrite...');

  const spyModel = createSpyModel('StagingData');
  const buffer = new DestinationBuffer({
    model: spyModel,
    batchSize: 1000,
    flushTimeoutMs: 2000, // Large timeout so flush only triggers on threshold
    writeMethod: 'bulkWrite'
  });

  // Push 999 records
  for (let i = 1; i <= 999; i++) {
    await buffer.push({ rowNumber: i, name: `User_${i}` });
  }

  assert.strictEqual(spyModel.getOperations().length, 0, 'No write should occur before 1,000 records');
  assert.strictEqual(buffer.buffer.length, 999, 'Buffer should hold 999 pending records');

  // Push 1,000th record -> should trigger immediate bulkWrite({ ordered: false })
  await buffer.push({ rowNumber: 1000, name: 'User_1000' });

  assert.strictEqual(spyModel.getOperations().length, 1, 'Exactly 1 bulkWrite should be executed');
  assert.strictEqual(spyModel.getOperations()[0].method, 'bulkWrite');
  assert.deepStrictEqual(spyModel.getOperations()[0].options, { ordered: false });
  assert.strictEqual(spyModel.getOperations()[0].ops.length, 1000);
  assert.strictEqual(buffer.buffer.length, 0, 'Buffer should be empty after flush');
  assert.strictEqual(buffer.getMetrics().totalIngested, 1000);

  // Test insertMany writeMethod variant
  spyModel.reset();
  const insertManyBuffer = new DestinationBuffer({
    model: spyModel,
    batchSize: 1000,
    flushTimeoutMs: 2000,
    writeMethod: 'insertMany'
  });

  for (let i = 1; i <= 1000; i++) {
    await insertManyBuffer.push({ rowNumber: i, name: `Item_${i}` });
  }

  assert.strictEqual(spyModel.getOperations().length, 1, 'insertMany operation should execute');
  assert.strictEqual(spyModel.getOperations()[0].method, 'insertMany');
  assert.strictEqual(spyModel.getOperations()[0].options.ordered, false);
  assert.strictEqual(spyModel.getOperations()[0].docs.length, 1000);

  await buffer.close();
  await insertManyBuffer.close();
  console.log(' DestinationBuffer 1,000 threshold tests passed!');
}

async function testDestinationBufferTimeoutFlush() {
  console.log('[Test 2] DestinationBuffer: Automatic timeout flushing for trailing records (500ms)...');

  const spyModel = createSpyModel('StagingData');
  const buffer = new DestinationBuffer({
    model: spyModel,
    batchSize: 1000,
    flushTimeoutMs: 300, // 300ms timeout for test
    writeMethod: 'bulkWrite'
  });

  // Push 42 trailing records (less than 1,000 batch size)
  for (let i = 1; i <= 42; i++) {
    await buffer.push({ rowNumber: i, name: `Trailing_${i}` });
  }

  assert.strictEqual(spyModel.getOperations().length, 0, 'Should not flush immediately when threshold not reached');
  assert.strictEqual(buffer.buffer.length, 42, 'Buffer should contain 42 trailing records');

  // Wait for timeout threshold to trigger flush automatically
  console.log(' Waiting for 350ms to verify automatic timeout flush...');
  await sleep(350);

  assert.strictEqual(spyModel.getOperations().length, 1, 'Automatic timeout should have triggered 1 bulkWrite');
  assert.strictEqual(spyModel.getOperations()[0].ops.length, 42, 'BulkWrite should contain all 42 trailing records');
  assert.strictEqual(buffer.buffer.length, 0, 'Buffer should be cleared after timeout flush');
  assert.strictEqual(buffer.getMetrics().totalIngested, 42);

  await buffer.close();
  console.log(' DestinationBuffer automatic timeout flushing passed!');
}

async function testDLQBufferThreshold() {
  console.log('[Test 3] DLQBuffer: Gathers up to 500 error rows before committing bulk insert to DLQ...');

  const spyModel = createSpyModel('DeadLetterQueue');
  const dlqBuffer = new DLQBuffer({
    model: spyModel,
    jobId: 'job_dlq_test',
    batchSize: 500,
    flushTimeoutMs: 2000,
    writeMethod: 'bulkWrite'
  });

  // Push 499 errors
  for (let i = 1; i <= 499; i++) {
    await dlqBuffer.push({
      rowNumber: i,
      rawData: { email: `bad_${i}@` },
      rejectedReason: 'Invalid email format',
      failedField: 'email'
    });
  }

  assert.strictEqual(spyModel.getOperations().length, 0, 'No commit should occur before 500 error rows');
  assert.strictEqual(dlqBuffer.buffer.length, 499, 'Buffer should hold 499 pending errors');

  // Push 500th error -> triggers commit
  await dlqBuffer.push({
    rowNumber: 500,
    rawData: { email: 'bad_500@' },
    rejectedReason: 'Invalid email format',
    failedField: 'email'
  });

  assert.strictEqual(spyModel.getOperations().length, 1, 'Exactly 1 bulkWrite should be committed to DLQ');
  assert.strictEqual(spyModel.getOperations()[0].method, 'bulkWrite');
  assert.deepStrictEqual(spyModel.getOperations()[0].options, { ordered: false });
  assert.strictEqual(spyModel.getOperations()[0].ops.length, 500);
  assert.strictEqual(dlqBuffer.buffer.length, 0, 'DLQ buffer should be cleared after commit');
  assert.strictEqual(dlqBuffer.getStats().totalLoggedErrors, 500);

  // Validate normalized document fields match DLQ Schema requirements
  const insertedDocs = spyModel.getInsertedDocuments();
  assert.strictEqual(insertedDocs[0].jobId, 'job_dlq_test');
  assert.strictEqual(insertedDocs[0].rowNumber, 1);
  assert.strictEqual(insertedDocs[0].rejectedReason, 'Invalid email format');
  assert.strictEqual(insertedDocs[0].failedField, 'email');
  assert(insertedDocs[0].timestamp instanceof Date, 'timestamp must be a Date');

  // Verify against real Mongoose DeadLetterQueue schema validation
  const dlqDocInstance = new DeadLetterQueue(insertedDocs[0]);
  const schemaErr = dlqDocInstance.validateSync();
  assert.strictEqual(schemaErr, undefined, 'Normalized DLQ doc must pass DeadLetterQueue Mongoose schema validation');

  await dlqBuffer.close();
  console.log(' DLQBuffer 500 threshold and schema validation passed!');
}

async function testDLQBufferTimeoutFlush() {
  console.log('[Test 4] DLQBuffer: Automatic timeout flushing for trailing errors (500ms)...');

  const spyModel = createSpyModel('DeadLetterQueue');
  const dlqBuffer = new DLQBuffer({
    model: spyModel,
    jobId: 'job_trailing_dlq',
    batchSize: 500,
    flushTimeoutMs: 300,
    writeMethod: 'bulkWrite'
  });

  // Push 15 error rows (well below 500 batch size)
  for (let i = 1; i <= 15; i++) {
    await dlqBuffer.push({
      rowNumber: i,
      rawData: { colA: 'val' },
      errorMessage: `Error detail #${i}`
    });
  }

  assert.strictEqual(spyModel.getOperations().length, 0, 'No write should happen immediately');
  assert.strictEqual(dlqBuffer.buffer.length, 15);

  console.log(' Waiting for 350ms to verify DLQ automatic timeout flush...');
  await sleep(350);

  assert.strictEqual(spyModel.getOperations().length, 1, 'Automatic timeout should commit trailing error batch');
  assert.strictEqual(spyModel.getOperations()[0].ops.length, 15, 'All 15 trailing errors committed');
  assert.strictEqual(dlqBuffer.buffer.length, 0);
  assert.strictEqual(dlqBuffer.getStats().totalLoggedErrors, 15);

  await dlqBuffer.close();
  console.log(' DLQBuffer automatic timeout flushing passed!');
}

async function testStreamingPipelineAndEndOfStreamFlush() {
  console.log('[Test 5] Streaming pipeline integration & end-of-stream trailing records flush...');

  const stagingSpy = createSpyModel('StagingData');
  const dlqSpy = createSpyModel('DeadLetterQueue');

  const destSink = new DestinationBuffer({
    model: stagingSpy,
    fileId: 'stream_test_file',
    batchSize: 1000,
    flushTimeoutMs: 500,
    writeMethod: 'bulkWrite'
  });

  const dlqSink = new DLQBuffer({
    model: dlqSpy,
    jobId: 'stream_test_file',
    batchSize: 500,
    flushTimeoutMs: 500,
    writeMethod: 'bulkWrite'
  });

  // Generate a stream of 2,345 clean records (2 full 1000-batches + 345 trailing records)
  async function* recordGenerator() {
    for (let i = 1; i <= 2345; i++) {
      yield { rowNumber: i, payload: { value: `val_${i}` } };
    }
  }

  const inputStream = Readable.from(recordGenerator());

  // Pipe into DestinationBuffer
  await pipeline(inputStream, destSink);

  // When pipeline completes, all 2,345 records should be flushed (even trailing 345)
  assert.strictEqual(stagingSpy.getOperations().length, 3, 'Should have 3 batches (1000, 1000, 345)');
  assert.strictEqual(stagingSpy.getOperations()[0].ops.length, 1000);
  assert.strictEqual(stagingSpy.getOperations()[1].ops.length, 1000);
  assert.strictEqual(stagingSpy.getOperations()[2].ops.length, 345);
  assert.strictEqual(destSink.getMetrics().totalIngested, 2345);
  assert.strictEqual(destSink.buffer.length, 0, 'Buffer must be empty after stream end');

  // Push 789 errors to DLQBuffer (1 full 500-batch + 289 trailing errors)
  for (let i = 1; i <= 789; i++) {
    await dlqSink.push({
      rowNumber: i,
      rawData: { line: i },
      rejectedReason: `Reason ${i}`
    });
  }

  // Close DLQ sink to clear trailing records at end
  await dlqSink.close();

  assert.strictEqual(dlqSpy.getOperations().length, 2, 'Should have 2 DLQ batches (500, 289)');
  assert.strictEqual(dlqSpy.getOperations()[0].ops.length, 500);
  assert.strictEqual(dlqSpy.getOperations()[1].ops.length, 289);
  assert.strictEqual(dlqSink.getStats().totalLoggedErrors, 789);
  assert.strictEqual(dlqSink.buffer.length, 0);

  console.log(' Streaming pipeline and end-of-stream trailing records flush passed!');
}

async function testConcurrentWritesAndSerialization() {
  console.log('[Test 6] Concurrent writes, race condition prevention, and queue serialization...');

  const spyModel = createSpyModel('StagingData');
  const buffer = new DestinationBuffer({
    model: spyModel,
    batchSize: 100,
    flushTimeoutMs: 100,
    writeMethod: 'bulkWrite'
  });

  // Rapidly push 350 records concurrently
  const promises = [];
  for (let i = 1; i <= 350; i++) {
    promises.push(buffer.push({ rowNumber: i, item: `concurrent_${i}` }));
  }

  await Promise.all(promises);
  await buffer.close();

  const totalOps = spyModel.getOperations();
  const totalInserted = totalOps.reduce((sum, op) => sum + op.ops.length, 0);

  assert.strictEqual(totalInserted, 350, 'All 350 records must be reliably persisted without data loss');
  assert.strictEqual(buffer.buffer.length, 0, 'Buffer must be completely empty');

  console.log(' Concurrent writes and queue serialization passed!');
}

async function runAllTests() {
  try {
    console.log('================================================================');
    console.log('     RUNNING BUFFERED SINKS & TIMEOUT FLUSH VERIFICATION TESTS  ');
    console.log('================================================================\n');

    await testDestinationBufferThreshold();
    await testDestinationBufferTimeoutFlush();
    await testDLQBufferThreshold();
    await testDLQBufferTimeoutFlush();
    await testStreamingPipelineAndEndOfStreamFlush();
    await testConcurrentWritesAndSerialization();

    console.log('\n================================================================');
    console.log('         ALL BUFFERED SINKS VERIFICATION TESTS PASSED!          ');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n Test Failure:', err);
    process.exit(1);
  }
}

runAllTests();
