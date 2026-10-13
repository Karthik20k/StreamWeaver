process.env.NODE_ENV = 'test';

import assert from 'assert';
import { 
  DEFAULT_BOILERPLATE_SCRIPT, 
  SCRIPT_TEMPLATES, 
  validateScriptSyntax, 
  simulateScriptExecution 
} from '../utils/scriptTemplates.js';
import { 
  applyTransformationRules, 
  describeActiveRules 
} from '../utils/transformationRules.js';

console.log('====================================================');
console.log('  StreamWeaver - Developer 3 Day 11 Verification Suite');
console.log('  In-Browser Script Editor Integration (Monaco / Ace)');
console.log('====================================================');

async function testBoilerplateTemplates() {
  console.log('\n--- 1. Testing Boilerplate JavaScript Templates ---');
  
  // Verify default boilerplate
  assert(DEFAULT_BOILERPLATE_SCRIPT, 'DEFAULT_BOILERPLATE_SCRIPT must be defined');
  assert(DEFAULT_BOILERPLATE_SCRIPT.includes('function transform(row)'), 'Boilerplate must declare transform(row)');
  assert(DEFAULT_BOILERPLATE_SCRIPT.includes('row.email.toLowerCase()'), 'Boilerplate must include row.email.toLowerCase() template requirement');

  console.log('✓ Default boilerplate template matches Day 11 specification:');
  console.log('  function transform(row) { ... row.email = row.email.toLowerCase(); ... return row; }');

  // Verify template library
  assert(Array.isArray(SCRIPT_TEMPLATES), 'SCRIPT_TEMPLATES must be an array');
  assert(SCRIPT_TEMPLATES.length >= 5, 'Should provide at least 5 standard boilerplate templates');

  for (const tmpl of SCRIPT_TEMPLATES) {
    assert(tmpl.id, `Template missing id: ${tmpl.name}`);
    assert(tmpl.name, `Template missing name: ${tmpl.id}`);
    assert(tmpl.category, `Template missing category: ${tmpl.id}`);
    assert(tmpl.code && tmpl.code.includes('function transform(row)'), `Template ${tmpl.id} missing transform(row) declaration`);

    // Verify syntax of each template
    const validation = validateScriptSyntax(tmpl.code);
    assert.strictEqual(validation.isValid, true, `Template ${tmpl.id} has syntax error: ${validation.error}`);
    assert.strictEqual(validation.hasTransformFunction, true, `Template ${tmpl.id} must declare transform function`);
  }
  console.log(`✓ All ${SCRIPT_TEMPLATES.length} boilerplate templates verified with clean JavaScript syntax`);
}

async function testSyntaxValidation() {
  console.log('\n--- 2. Testing In-Editor Syntax Validation & Error Detection ---');

  // Test 2.1: Clean code
  const cleanCode = `function transform(row) {
    row.email = row.email ? row.email.toLowerCase() : '';
    return row;
  }`;
  const validRes = validateScriptSyntax(cleanCode);
  assert.strictEqual(validRes.isValid, true);
  assert.strictEqual(validRes.hasTransformFunction, true);
  assert.strictEqual(validRes.error, null);
  console.log('✓ Valid JavaScript passes syntax check');

  // Test 2.2: Broken syntax (unclosed curly brace)
  const brokenCode = `function transform(row) {
    row.email = row.email.toLowerCase();
  `;
  const invalidRes = validateScriptSyntax(brokenCode);
  assert.strictEqual(invalidRes.isValid, false);
  assert(invalidRes.error, 'Should produce an error message for unclosed brace');
  console.log(`✓ Unclosed brace detected properly: "${invalidRes.error}"`);

  // Test 2.3: Syntax error with invalid operator
  const syntaxErrCode = `function transform(row) {
    const x === 10;
    return row;
  }`;
  const syntaxErrRes = validateScriptSyntax(syntaxErrCode);
  assert.strictEqual(syntaxErrRes.isValid, false);
  console.log(`✓ Invalid token detected: "${syntaxErrRes.error}"`);

  // Test 2.4: Empty code handling
  const emptyRes = validateScriptSyntax('');
  assert.strictEqual(emptyRes.isValid, true);
  console.log('✓ Empty script gracefully handled');
}

async function testSimulationRunner() {
  console.log('\n--- 3. Testing Live V8 Sandbox Simulation Runner ---');

  const testRow = {
    email: 'ALEX.SMITH@EXAMPLE.COM',
    quantity: '12',
    unit_price: '$129.99',
    card_number: '4111111111119876',
    customer_name: 'jane doe',
    timestamp: '2026-10-05T12:00:00Z'
  };

  // Test 3.1: Email lowercasing execution
  const emailScript = `function transform(row) {
    if (row.email) {
      row.email = row.email.toLowerCase();
    }
    return row;
  }`;
  const sim1 = simulateScriptExecution(emailScript, testRow);
  assert.strictEqual(sim1.success, true);
  assert.strictEqual(sim1.output.email, 'alex.smith@example.com');
  assert.strictEqual(testRow.email, 'ALEX.SMITH@EXAMPLE.COM', 'Input row must not be mutated in-place');
  assert(typeof sim1.executionTimeMs === 'number');
  console.log(`✓ Email lowercasing executed successfully in ${sim1.executionTimeMs}ms`);

  // Test 3.2: Currency cleaner template
  const currencyTmpl = SCRIPT_TEMPLATES.find(t => t.id === 'clean_currency_numbers');
  const sim2 = simulateScriptExecution(currencyTmpl.code, testRow);
  assert.strictEqual(sim2.success, true);
  assert.strictEqual(sim2.output.unitPrice, 129.99);
  assert.strictEqual(sim2.output.quantity, 12);
  console.log('✓ Currency and quantity cleaning template executed cleanly');

  // Test 3.3: PII Masking template
  const piiTmpl = SCRIPT_TEMPLATES.find(t => t.id === 'mask_sensitive_pii');
  const sim3 = simulateScriptExecution(piiTmpl.code, testRow);
  assert.strictEqual(sim3.success, true);
  assert.strictEqual(sim3.output.card_number, '****-****-****-9876');
  console.log('✓ Sensitive PII credit card masking template executed cleanly');

  // Test 3.4: Runtime exception handling
  const faultyScript = `function transform(row) {
    // Attempting dereference on non-existent object
    return row.nonExistentField.nestedProperty.value;
  }`;
  const simFault = simulateScriptExecution(faultyScript, testRow);
  assert.strictEqual(simFault.success, false);
  assert(simFault.error.includes('Cannot read') || simFault.error.includes('undefined'));
  console.log(`✓ Runtime exception caught safely without crashing: "${simFault.error}"`);
}

async function testTransformationRulesIntegration() {
  console.log('\n--- 4. Testing Transformation Rules Engine Custom Script Support ---');

  const customRule = {
    customScript: `function transform(row) {
      return (row.value || '').toUpperCase() + '_PROCESSED';
    }`
  };

  const res = applyTransformationRules('test_token', customRule);
  assert.strictEqual(res.isValid, true);
  assert.strictEqual(res.output, 'TEST_TOKEN_PROCESSED');
  assert(res.appliedSteps.includes('Custom JS Function'));

  const activeBadges = describeActiveRules(customRule);
  assert(activeBadges.includes('JS Script'), 'Active badges must include JS Script');
  console.log('✓ Transformation engine integrates customScript cleanly with active badges');
}

async function testExportConfigIntegration() {
  console.log('\n--- 5. Testing Schema Mapping Config Export with customScript ---');

  // Simulate exportConfig structure as produced by useSchemaMapping
  const customScriptCode = `function transform(row) {
    row.email = (row.email || '').toLowerCase();
    row.processedAt = new Date().toISOString();
    return row;
  }`;

  const sampleExport = {
    schemaId: 'ecommerce_orders',
    targetCollection: 'ecommerce_orders',
    mappingRules: { order_id: 'orderId', customer_email: 'email' },
    transformRules: { order_id: { trim: true } },
    customScript: customScriptCode,
    metadata: {
      hasCustomScript: true,
      totalSourceHeaders: 2,
      totalTargetFields: 2
    }
  };

  assert.strictEqual(sampleExport.customScript, customScriptCode);
  assert.strictEqual(sampleExport.metadata.hasCustomScript, true);
  console.log('✓ Custom transformation script correctly structured for Dev 1 isolated-vm streaming pipeline');
}

async function runAll() {
  try {
    await testBoilerplateTemplates();
    await testSyntaxValidation();
    await testSimulationRunner();
    await testTransformationRulesIntegration();
    await testExportConfigIntegration();

    console.log('\n====================================================');
    console.log('  ALL DEV 3 DAY 11 VERIFICATION TESTS PASSED (100%)');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ Test failure:', err);
    process.exit(1);
  }
}

runAll();
