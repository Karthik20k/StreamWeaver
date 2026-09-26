const assert = require('node:assert');
const { TargetSchema, IngestionJob } = require('../src/models');

async function testTargetSchema() {
  console.log('[Test] Running TargetSchema tests...');

  // 1. Instantiating valid TargetSchema
  const validSchema = new TargetSchema({
    name: 'CustomerOrders',
    description: 'Schema for ingested retail orders',
    version: 1,
    fields: [
      {
        name: 'orderId',
        type: 'String',
        constraints: { required: true, unique: true }
      },
      {
        name: 'amount',
        type: 'Number',
        constraints: { required: true }
      },
      {
        name: 'orderDate',
        type: 'Date',
        constraints: { required: false }
      }
    ]
  });

  const valErr = validSchema.validateSync();
  assert.strictEqual(valErr, undefined, 'Valid TargetSchema should not produce validation errors');

  // 2. Validate row casting & checks
  const validRow = {
    orderId: 'ORD-1234',
    amount: '49.99',
    orderDate: '2026-09-26T12:00:00Z'
  };

  const validationResult = validSchema.validateRow(validRow);
  assert.strictEqual(validationResult.isValid, true, 'Row should pass validation');
  assert.strictEqual(validationResult.sanitized.orderId, 'ORD-1234');
  assert.strictEqual(validationResult.sanitized.amount, 49.99);
  assert(validationResult.sanitized.orderDate instanceof Date);

  // 3. Test invalid row missing required field
  const invalidRow = {
    amount: 'not-a-number'
  };
  const failedResult = validSchema.validateRow(invalidRow);
  assert.strictEqual(failedResult.isValid, false, 'Invalid row should fail validation');
  assert(failedResult.errors.some(e => e.includes('orderId')), 'Should report missing orderId');
  assert(failedResult.errors.some(e => e.includes('amount')), 'Should report invalid amount');

  // 4. Test missing required fields in TargetSchema model
  const emptySchema = new TargetSchema({});
  const emptyErr = emptySchema.validateSync();
  assert(emptyErr && emptyErr.errors.name, 'TargetSchema name should be required');
  assert(emptyErr && emptyErr.errors.fields, 'TargetSchema fields should be required');

  console.log(' TargetSchema tests passed successfully!');
}

async function testIngestionJob() {
  console.log('[Test] Running IngestionJob tests...');

  // 1. Instantiating valid IngestionJob with defaults
  const job = new IngestionJob({
    fileName: 'large_dataset.csv'
  });

  const valErr = job.validateSync();
  assert.strictEqual(valErr, undefined, 'IngestionJob with fileName should pass validation with defaults');
  assert(job.jobId.startsWith('job_'), 'jobId should auto-generate with default prefix');
  assert.strictEqual(job.fileName, 'large_dataset.csv');
  assert.strictEqual(job.status, 'pending');
  assert.strictEqual(job.totalRowsProcessed, 0);
  assert.strictEqual(job.errorCount, 0);
  assert(job.createdAt instanceof Date);

  // 2. Test status enum constraints
  job.status = 'invalid_status';
  const invalidStatusErr = job.validateSync();
  assert(invalidStatusErr && invalidStatusErr.errors.status, 'Invalid status enum should be rejected');

  // 3. Test missing fileName
  const missingFileJob = new IngestionJob({});
  const missingFileErr = missingFileJob.validateSync();
  assert(missingFileErr && missingFileErr.errors.fileName, 'fileName should be required');

  console.log(' IngestionJob tests passed successfully!');
}

async function run() {
  try {
    await testTargetSchema();
    await testIngestionJob();
    console.log('\n All Mongoose schema tests passed!');
  } catch (err) {
    console.error('\n Test failed:', err);
    process.exit(1);
  }
}

run();
