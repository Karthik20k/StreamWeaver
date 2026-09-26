process.env.NODE_ENV = 'test';

import assert from 'assert';
import { 
  performSmartAutoMatch, 
  calculateStringSimilarity, 
  levenshteinDistance,
  tokenize,
  calculateTokenOverlap 
} from '../utils/autoMapper.js';
import { validateMappingConfig } from '../utils/configValidator.js';
import { PREDEFINED_TARGET_SCHEMAS } from '../utils/targetSchemas.js';

function testFuzzyMatchingAlgorithms() {
  console.log('\n--- 1. Testing String Distance & Fuzzy Matching Helpers ---');

  // Levenshtein distance
  assert.strictEqual(levenshteinDistance('kitten', 'sitting'), 3);
  assert.strictEqual(levenshteinDistance('orderid', 'orderid'), 0);
  assert.strictEqual(levenshteinDistance('firstname', 'first_name'), 1);

  // String similarity (0.0 to 1.0)
  const exactSim = calculateStringSimilarity('first_name', 'firstName');
  assert.strictEqual(exactSim, 1.0, 'Normalized exact match should have 1.0 similarity');

  const typoSim = calculateStringSimilarity('product_nme', 'productName');
  assert(typoSim >= 0.85, `Typo similarity should be >= 0.85, got ${typoSim}`);

  // Tokenization & Token Overlap
  const tokens = tokenize('customer_account_id');
  assert.deepStrictEqual(tokens, ['customer', 'account', 'id']);

  const overlap = calculateTokenOverlap('customer_id', 'customerId');
  assert.strictEqual(overlap, 1.0);

  console.log('✓ Levenshtein distance, similarity score, and tokenization verified');
}

function testAutoMatchTiers() {
  console.log('\n--- 2. Testing Multi-Tier Auto-Match Heuristics ---');

  const ecommerceSchema = PREDEFINED_TARGET_SCHEMAS.find(s => s.id === 'ecommerce_orders');
  assert(ecommerceSchema, 'ecommerce_orders schema must exist');

  // Test with variations: mixed case, typos, synonyms, and underscores
  const testHeaders = [
    'Order_Id',          // Exact normalized
    'cust_id',           // Synonym / Token match
    'SKU',               // Exact
    'prod_name',         // Token / Fuzzy match
    'category',          // Exact
    'price',             // Synonym match ('price' -> 'unitPrice')
    'qty',               // Synonym match ('qty' -> 'quantity')
    'timestamp',         // Exact
    'status'             // Exact
  ];

  const result = performSmartAutoMatch(testHeaders, ecommerceSchema.fields);
  console.log('Auto-match result summary:', result.summary);

  assert.strictEqual(result.mappings['Order_Id'], 'orderId');
  assert.strictEqual(result.mappings['cust_id'], 'customerId');
  assert.strictEqual(result.mappings['SKU'], 'sku');
  assert.strictEqual(result.mappings['prod_name'], 'productName');
  assert.strictEqual(result.mappings['category'], 'category');
  assert.strictEqual(result.mappings['price'], 'unitPrice');
  assert.strictEqual(result.mappings['qty'], 'quantity');
  assert.strictEqual(result.mappings['timestamp'], 'timestamp');
  assert.strictEqual(result.mappings['status'], 'status');

  assert.strictEqual(result.summary.matchedCount, 9, 'All 9 source headers must be matched');
  assert.strictEqual(result.summary.isAllRequiredMatched, true, 'All required fields matched');

  // Verify match details metadata
  assert(result.matchDetails.length === 9);
  for (const m of result.matchDetails) {
    assert(m.sourceColumn && m.targetField && m.scoreLabel);
    assert(m.confidence >= 0.5);
  }

  console.log('✓ Multi-tier auto-match resolved exact, synonym, token, and fuzzy cases');
}

function testPreUploadValidationChecker() {
  console.log('\n--- 3. Testing Pre-Upload Validation Checker (Required Fields & Duplicates) ---');

  const ecommerceSchema = PREDEFINED_TARGET_SCHEMAS.find(s => s.id === 'ecommerce_orders');
  const targetFields = ecommerceSchema.fields;
  const sourceHeaders = ['order_id', 'customer_id', 'sku', 'product_name', 'unit_price', 'quantity', 'timestamp'];

  // Test Case A: Missing Required Field
  // Suppose 'timestamp' (which is required) is unmapped
  const incompleteMappings = {
    'order_id': 'orderId',
    'customer_id': 'customerId',
    'sku': 'sku',
    'product_name': 'productName',
    'unit_price': 'unitPrice',
    'quantity': 'quantity'
    // missing timestamp
  };

  const validationA = validateMappingConfig(incompleteMappings, targetFields, sourceHeaders);
  assert.strictEqual(validationA.isValid, false, 'Incomplete mapping must NOT be valid');
  assert.strictEqual(validationA.canProceed, false, 'canProceed must be false when required field is missing');
  assert(validationA.missingRequiredFields.some(f => f.name === 'timestamp'), 'timestamp must be listed as missing');
  assert.strictEqual(validationA.criticalErrorsCount, 1);
  console.log('✓ Missing required field detected and blocks upload');

  // Test Case B: Duplicate Target Collisions
  // Multiple source columns mapped to the same target field 'customerId'
  const duplicateMappings = {
    'order_id': 'orderId',
    'customer_id': 'customerId',
    'buyer_account_id': 'customerId', // DUPLICATE COLLISION
    'sku': 'sku',
    'product_name': 'productName',
    'unit_price': 'unitPrice',
    'quantity': 'quantity',
    'timestamp': 'timestamp'
  };

  const validationB = validateMappingConfig(duplicateMappings, targetFields, [...sourceHeaders, 'buyer_account_id']);
  assert.strictEqual(validationB.isValid, false, 'Duplicate target mapping must be invalid');
  assert.strictEqual(validationB.canProceed, false);
  assert.strictEqual(validationB.duplicateTargetAlerts.length, 1, 'Should detect 1 duplicate target alert');
  assert.deepStrictEqual(validationB.duplicateTargetAlerts[0].conflictingSources, ['customer_id', 'buyer_account_id']);
  console.log('✓ Duplicate mapping collision detected and alerts user');

  // Test Case C: Type Compatibility Warnings
  const inferredTypes = {
    'product_name': 'str',
    'unit_price': 'str' // text instead of number
  };
  const validationC = validateMappingConfig(
    { 'order_id': 'orderId', 'customer_id': 'customerId', 'sku': 'sku', 'product_name': 'productName', 'unit_price': 'unitPrice', 'quantity': 'quantity', 'timestamp': 'timestamp' },
    targetFields,
    sourceHeaders,
    inferredTypes
  );

  assert(validationC.warnings.length > 0, 'Should generate type warning when string mapped to Number');
  assert.strictEqual(validationC.warnings[0].type, 'TYPE_POSSIBLE_MISMATCH');
  console.log('✓ Type mismatch compatibility warnings generated');

  // Test Case D: Fully Valid Mapping
  const completeMappings = {
    'order_id': 'orderId',
    'customer_id': 'customerId',
    'sku': 'sku',
    'product_name': 'productName',
    'unit_price': 'unitPrice',
    'quantity': 'quantity',
    'timestamp': 'timestamp'
  };
  const validationD = validateMappingConfig(completeMappings, targetFields, sourceHeaders);
  assert.strictEqual(validationD.isValid, true, 'Fully satisfied mapping must be valid');
  assert.strictEqual(validationD.canProceed, true, 'canProceed must be true when all required fields satisfied');
  assert.strictEqual(validationD.criticalErrorsCount, 0);
  console.log('✓ Fully satisfied mapping passes all pre-upload validation checks');
}

function runDev3Day3Verification() {
  console.log('====================================================');
  console.log('  StreamWeaver - Developer 3 Day 3 Verification Suite');
  console.log('====================================================');

  try {
    testFuzzyMatchingAlgorithms();
    testAutoMatchTiers();
    testPreUploadValidationChecker();

    console.log('\n====================================================');
    console.log('  ALL DEV 3 DAY 3 VERIFICATION TESTS PASSED (100%)');
    console.log('====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runDev3Day3Verification();
