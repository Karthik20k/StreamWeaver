const assert = require('node:assert');
const { TargetSchema, DeadLetterQueue, DLQ } = require('../src/models');
const {
  validateField,
  validateRow,
  createDLQRecords,
  createPipelineRowValidator,
  getCompiledRegex
} = require('../src/pipeline/validationEngine');
const { PREDEFINED_SCHEMAS } = require('../src/config/predefinedSchemas');

async function testDLQSchema() {
  console.log('[Test 1] Testing DeadLetterQueue (DLQ) Schema...');

  // Verify alias export
  assert.strictEqual(DLQ, DeadLetterQueue, 'DLQ alias should reference DeadLetterQueue model');

  // 1. Valid DLQ record
  const validDLQ = new DeadLetterQueue({
    jobId: 'job_test_123',
    rowNumber: 42,
    rawData: { orderId: 'ORD-999', email: 'invalid-email' },
    rejectedReason: "Field 'customerEmail' failed email format validation",
    failedField: 'customerEmail'
  });

  const err = validDLQ.validateSync();
  assert.strictEqual(err, undefined, 'Valid DLQ record should not produce schema errors');
  assert.strictEqual(validDLQ.jobId, 'job_test_123');
  assert.strictEqual(validDLQ.rowNumber, 42);
  assert.strictEqual(validDLQ.failedField, 'customerEmail');
  assert(validDLQ.timestamp instanceof Date, 'timestamp should default to Date');

  // 2. Missing required fields in DLQ
  const invalidDLQ = new DeadLetterQueue({});
  const missingErr = invalidDLQ.validateSync();
  assert(missingErr && missingErr.errors.jobId, 'jobId should be required');
  assert(missingErr && missingErr.errors.rowNumber, 'rowNumber should be required');
  assert(missingErr && missingErr.errors.rejectedReason, 'rejectedReason should be required');

  console.log(' DeadLetterQueue schema tests passed!');
}

async function testValidationEngineRequirements() {
  console.log('[Test 2] Testing Lightweight Validation Engine...');

  // 1. Required target fields populated verification
  const requiredField = {
    name: 'username',
    type: 'String',
    constraints: { required: true }
  };

  const emptyRes1 = validateField('', requiredField);
  assert.strictEqual(emptyRes1.isValid, false, 'Empty string should fail required constraint');
  assert(emptyRes1.error.includes('required'), 'Should state field is required');

  const nullRes = validateField(null, requiredField);
  assert.strictEqual(nullRes.isValid, false, 'Null should fail required constraint');

  const undefRes = validateField(undefined, requiredField);
  assert.strictEqual(undefRes.isValid, false, 'Undefined should fail required constraint');

  const validRes1 = validateField('alice123', requiredField);
  assert.strictEqual(validRes1.isValid, true, 'Valid string should pass');
  assert.strictEqual(validRes1.sanitizedValue, 'alice123');

  // 2. Validate regex formats: Email strings
  const emailField = {
    name: 'email',
    type: 'String',
    constraints: { required: true, pattern: 'email' }
  };

  assert.strictEqual(validateField('user@example.com', emailField).isValid, true);
  assert.strictEqual(validateField('firstname.lastname@company.co.uk', emailField).isValid, true);
  assert.strictEqual(validateField('invalid-email-address', emailField).isValid, false);
  assert.strictEqual(validateField('user@.com', emailField).isValid, false);
  assert.strictEqual(validateField('@domain.com', emailField).isValid, false);

  // 3. Validate regex formats: Phone numbers
  const phoneField = {
    name: 'phone',
    type: 'String',
    constraints: { required: false, pattern: 'phone' }
  };

  assert.strictEqual(validateField('+1-555-123-4567', phoneField).isValid, true);
  assert.strictEqual(validateField('(555) 019-2834', phoneField).isValid, true);
  assert.strictEqual(validateField('+44 20 7946 0919', phoneField).isValid, true);
  assert.strictEqual(validateField('abc-def-ghij', phoneField).isValid, false);
  assert.strictEqual(validateField('12', phoneField).isValid, false); // too short

  // 4. Validate range constraints: min & max on Number
  const numberField = {
    name: 'age',
    type: 'Number',
    constraints: { required: true, min: 18, max: 65 }
  };

  assert.strictEqual(validateField('25', numberField).isValid, true);
  assert.strictEqual(validateField('17', numberField).isValid, false);
  assert(validateField('17', numberField).error.includes('below minimum'));
  assert.strictEqual(validateField('70', numberField).isValid, false);
  assert(validateField('70', numberField).error.includes('exceeds maximum'));

  // 5. Validate range constraints: min & max length on String
  const strLenField = {
    name: 'password',
    type: 'String',
    constraints: { required: true, min: 6, max: 20 }
  };

  assert.strictEqual(validateField('secret123', strLenField).isValid, true);
  assert.strictEqual(validateField('12345', strLenField).isValid, false);
  assert.strictEqual(validateField('a'.repeat(25), strLenField).isValid, false);

  // 6. Validate range constraints: allowedValues (Enum)
  const enumField = {
    name: 'status',
    type: 'String',
    constraints: { required: true, allowedValues: ['active', 'pending', 'suspended'] }
  };

  assert.strictEqual(validateField('active', enumField).isValid, true);
  assert.strictEqual(validateField('PENDING', enumField).isValid, true); // Case-insensitive check
  assert.strictEqual(validateField('deleted', enumField).isValid, false);
  assert(validateField('deleted', enumField).error.includes('not in allowed values'));

  console.log(' Lightweight Validation Engine tests passed!');
}

async function testDLQRecordGeneration() {
  console.log('[Test 3] Testing DLQ Error Record Generation...');

  const schema = {
    name: 'TestSchema',
    fields: [
      { name: 'email', type: 'String', constraints: { required: true, pattern: 'email' } },
      { name: 'amount', type: 'Number', constraints: { required: true, min: 10 } }
    ]
  };

  const rawRow = {
    email: 'bad-email',
    amount: 5
  };

  const valResult = validateRow(rawRow, schema);
  assert.strictEqual(valResult.isValid, false);
  assert.strictEqual(valResult.errors.length, 2);

  const dlqRecords = createDLQRecords({
    jobId: 'job_batch_001',
    rowNumber: 15,
    rawData: rawRow,
    errors: valResult.errors
  });

  assert.strictEqual(dlqRecords.length, 2);
  assert.strictEqual(dlqRecords[0].jobId, 'job_batch_001');
  assert.strictEqual(dlqRecords[0].rowNumber, 15);
  assert.strictEqual(dlqRecords[0].rawData, rawRow);
  assert.strictEqual(dlqRecords[0].failedField, 'email');
  assert(dlqRecords[0].rejectedReason.includes('email format validation'));
  assert(dlqRecords[0].timestamp instanceof Date);

  assert.strictEqual(dlqRecords[1].failedField, 'amount');
  assert(dlqRecords[1].rejectedReason.includes('below minimum'));

  console.log(' DLQ error records generation verified!');
}

async function testPredefinedSchemasAndModelMethods() {
  console.log('[Test 4] Testing Predefined Schemas Library & TargetSchema Model...');

  assert(Array.isArray(PREDEFINED_SCHEMAS), 'PREDEFINED_SCHEMAS should be an array');
  assert(PREDEFINED_SCHEMAS.length >= 4, 'Should contain multiple predefined templates for Dev 3 UI');

  const orderSchemaDef = PREDEFINED_SCHEMAS.find(s => s.name === 'CustomerOrders');
  assert(orderSchemaDef, 'CustomerOrders predefined schema must exist');

  const schemaInstance = new TargetSchema(orderSchemaDef);
  const valErr = schemaInstance.validateSync();
  assert.strictEqual(valErr, undefined, 'Predefined schema should pass Mongoose model validation');

  // Test row validation through model instance
  const passingRow = {
    orderId: 'ORD12345',
    customerEmail: 'customer@shop.com',
    customerPhone: '+1-800-555-0199',
    amount: 149.50,
    quantity: 2,
    status: 'pending'
  };

  const modelValResult = schemaInstance.validateRow(passingRow);
  assert.strictEqual(modelValResult.isValid, true);
  assert.strictEqual(modelValResult.sanitized.orderId, 'ORD12345');
  assert.strictEqual(modelValResult.sanitized.amount, 149.50);

  // Test failing row with multiple errors
  const failingRow = {
    orderId: 'ORD-FAIL',
    customerEmail: 'not-an-email',
    amount: -10,
    quantity: 0,
    status: 'unknown_status'
  };

  const failingValResult = schemaInstance.validateRow(failingRow);
  assert.strictEqual(failingValResult.isValid, false);
  assert(failingValResult.errors.some(e => e.includes('customerEmail')));
  assert(failingValResult.errors.some(e => e.includes('amount')));
  assert(failingValResult.errors.some(e => e.includes('quantity')));
  assert(failingValResult.errors.some(e => e.includes('status')));

  console.log(' Predefined schemas and TargetSchema model validation passed!');
}

async function runAll() {
  try {
    await testDLQSchema();
    await testValidationEngineRequirements();
    await testDLQRecordGeneration();
    await testPredefinedSchemasAndModelMethods();
    console.log('\n=============================================');
    console.log(' ALL VALIDATION, DLQ, AND SCHEMA TESTS PASSED!');
    console.log('=============================================\n');
  } catch (err) {
    console.error('\n Test Failure:', err);
    process.exit(1);
  }
}

runAll();
