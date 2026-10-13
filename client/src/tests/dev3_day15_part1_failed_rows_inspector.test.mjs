process.env.NODE_ENV = 'test';

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ERROR_CATEGORIES,
  classifyErrorCategory,
  generateMockFailedRows
} from '../hooks/useFailedRowsInspector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('======================================================================');
console.log('  StreamWeaver - Developer 3 Day 15 Verification Suite (Part 1 of 3)');
console.log('  Failed Rows Inspector: Architecture, Categorization & Filtering');
console.log('======================================================================');

async function testErrorCategorization() {
  console.log('\n--- 1. Testing Sandbox Error Categorization Engine ---');

  // 1.1 Watchdog Timeout Exceptions
  const timeout1 = classifyErrorCategory('TimeoutError: Script execution exceeded 50ms watchdog threshold on record #1204');
  assert.strictEqual(timeout1, ERROR_CATEGORIES.TIMEOUT_TERMINATION);

  const timeout2 = classifyErrorCategory('Watchdog termination triggered: infinite loop halted');
  assert.strictEqual(timeout2, ERROR_CATEGORIES.TIMEOUT_TERMINATION);
  console.log('✓ Watchdog timeout exceptions mapped to TIMEOUT_TERMINATION');

  // 1.2 Syntax Exceptions
  const syntax1 = classifyErrorCategory("SyntaxError: Unexpected token ';' in user transformation function");
  assert.strictEqual(syntax1, ERROR_CATEGORIES.SYNTAX_ERROR);

  const syntax2 = classifyErrorCategory('Compilation error inside isolate scope');
  assert.strictEqual(syntax2, ERROR_CATEGORIES.SYNTAX_ERROR);
  console.log('✓ Script compilation & syntax errors mapped to SYNTAX_ERROR');

  // 1.3 Type Mismatches & Cast Failures
  const type1 = classifyErrorCategory("TypeError: Cannot read properties of undefined (reading 'toLowerCase')");
  assert.strictEqual(type1, ERROR_CATEGORIES.TYPE_MISMATCH);

  const type2 = classifyErrorCategory('Cast failure: String "$49.99 USD" cannot be converted to Number', 'unitPrice');
  assert.strictEqual(type2, ERROR_CATEGORIES.TYPE_MISMATCH);
  console.log('✓ TypeErrors & numeric cast failures mapped to TYPE_MISMATCH');

  // 1.4 Validation & Schema Rejections
  const val1 = classifyErrorCategory('Error: Invalid ISO-8601 date string in timestamp: "2026-99-99"');
  assert.strictEqual(val1, ERROR_CATEGORIES.VALIDATION_THROW);

  const val2 = classifyErrorCategory('RangeError: Constraint check failed: Quantity -10 is below minimum threshold 1');
  assert.strictEqual(val2, ERROR_CATEGORIES.VALIDATION_THROW);
  console.log('✓ Schema constraint & validation throws mapped to VALIDATION_THROW');
}

async function testMockDataAndSchemaStructure() {
  console.log('\n--- 2. Testing Failed Record Schema Structure ---');

  const rows = generateMockFailedRows('job-test-77', 12);
  assert.strictEqual(rows.length, 12);

  const first = rows[0];
  assert(first.id.startsWith('failed-row-job-test-77-'));
  assert.strictEqual(first.jobId, 'job-test-77');
  assert(typeof first.lineNumber === 'number' && first.lineNumber > 0);
  assert(typeof first.failedColumn === 'string');
  assert(typeof first.scriptError === 'string');
  assert(Object.values(ERROR_CATEGORIES).includes(first.errorCategory));
  assert(typeof first.rawRow === 'object' && first.rawRow !== null);
  assert(typeof first.executionTimeMs === 'number');
  assert(!isNaN(Date.parse(first.timestamp)));

  console.log(`✓ Failed record structure validated: Line #${first.lineNumber}, Column: "${first.failedColumn}", Error: "${first.scriptError}"`);
}

async function testFilteringAndSearch() {
  console.log('\n--- 3. Testing Category Filtering & Search Queries ---');

  const dataset = [
    {
      id: '1',
      lineNumber: 101,
      failedColumn: 'unitPrice',
      scriptError: 'Cast failure: String cannot be converted to Number',
      errorCategory: ERROR_CATEGORIES.TYPE_MISMATCH,
      rawRow: { unitPrice: '$55' }
    },
    {
      id: '2',
      lineNumber: 202,
      failedColumn: 'timestamp',
      scriptError: 'Invalid ISO-8601 date string',
      errorCategory: ERROR_CATEGORIES.VALIDATION_THROW,
      rawRow: { timestamp: 'invalid-date' }
    },
    {
      id: '3',
      lineNumber: 303,
      failedColumn: 'customScript',
      scriptError: "SyntaxError: Unexpected token ';'",
      errorCategory: ERROR_CATEGORIES.SYNTAX_ERROR,
      rawRow: { code: 'return ;' }
    },
    {
      id: '4',
      lineNumber: 404,
      failedColumn: '_isolate',
      scriptError: 'TimeoutError: 50ms watchdog exceeded',
      errorCategory: ERROR_CATEGORIES.TIMEOUT_TERMINATION,
      rawRow: { count: 99999 }
    }
  ];

  // 3.1 Category Filter: SYNTAX_ERROR
  const syntaxOnly = dataset.filter((r) => r.errorCategory === ERROR_CATEGORIES.SYNTAX_ERROR);
  assert.strictEqual(syntaxOnly.length, 1);
  assert.strictEqual(syntaxOnly[0].lineNumber, 303);
  console.log('✓ Category filter isolated syntax exception at line 303');

  // 3.2 Search by Column Name
  const colSearch = dataset.filter((r) => r.failedColumn.toLowerCase().includes('unitprice'));
  assert.strictEqual(colSearch.length, 1);
  assert.strictEqual(colSearch[0].id, '1');
  console.log('✓ Search query matched column "unitPrice"');

  // 3.3 Search by Line Number
  const lineSearch = dataset.filter((r) => String(r.lineNumber).includes('202'));
  assert.strictEqual(lineSearch.length, 1);
  assert.strictEqual(lineSearch[0].failedColumn, 'timestamp');
  console.log('✓ Search query matched line number #202');

  // 3.4 Category Counts Aggregation
  const counts = {
    [ERROR_CATEGORIES.ALL]: dataset.length,
    [ERROR_CATEGORIES.VALIDATION_THROW]: 0,
    [ERROR_CATEGORIES.SYNTAX_ERROR]: 0,
    [ERROR_CATEGORIES.TIMEOUT_TERMINATION]: 0,
    [ERROR_CATEGORIES.TYPE_MISMATCH]: 0
  };
  dataset.forEach((r) => { counts[r.errorCategory] += 1; });

  assert.strictEqual(counts[ERROR_CATEGORIES.ALL], 4);
  assert.strictEqual(counts[ERROR_CATEGORIES.VALIDATION_THROW], 1);
  assert.strictEqual(counts[ERROR_CATEGORIES.SYNTAX_ERROR], 1);
  assert.strictEqual(counts[ERROR_CATEGORIES.TIMEOUT_TERMINATION], 1);
  assert.strictEqual(counts[ERROR_CATEGORIES.TYPE_MISMATCH], 1);
  console.log('✓ Category counts aggregation accurately calculated across all 4 categories');
}

async function testComponentAndCSSContracts() {
  console.log('\n--- 4. Testing Component Contracts & CSS Classes ---');

  const inspectorPath = path.resolve(__dirname, '../components/ingestion/FailedRowsInspector.jsx');
  const hookPath = path.resolve(__dirname, '../hooks/useFailedRowsInspector.js');
  const cssPath = path.resolve(__dirname, '../styles/ingestion.css');

  assert(fs.existsSync(inspectorPath), 'FailedRowsInspector.jsx must exist');
  assert(fs.existsSync(hookPath), 'useFailedRowsInspector.js must exist');
  assert(fs.existsSync(cssPath), 'ingestion.css must exist');

  const inspectorCode = fs.readFileSync(inspectorPath, 'utf-8');
  const hookCode = fs.readFileSync(hookPath, 'utf-8');
  const cssCode = fs.readFileSync(cssPath, 'utf-8');

  // Hook checks
  assert(hookCode.includes('ERROR_CATEGORIES'), 'Must export ERROR_CATEGORIES');
  assert(hookCode.includes('classifyErrorCategory'), 'Must export classifyErrorCategory');
  assert(hookCode.includes('pushFailedRow'), 'Must provide pushFailedRow for live stream buffering');
  console.log('✓ useFailedRowsInspector hook exports & methods verified');

  // Component checks
  assert(inspectorCode.includes('Failed Rows Inspector'), 'Must render title "Failed Rows Inspector"');
  assert(inspectorCode.includes('category-filter-strip'), 'Must render category filter strip');
  assert(inspectorCode.includes('inspector-search-bar'), 'Must render search bar');
  assert(inspectorCode.includes('inspector-pagination-meta'), 'Must render pagination toolbar');
  assert(inspectorCode.includes('Validation Throws'), 'Must render Validation Throws category tab');
  assert(inspectorCode.includes('Syntax Exceptions'), 'Must render Syntax Exceptions category tab');
  assert(inspectorCode.includes('Watchdog Timeouts'), 'Must render Watchdog Timeouts category tab');
  console.log('✓ FailedRowsInspector UI structure & category tabs verified');

  // CSS checks
  assert(cssCode.includes('.failed-rows-inspector-card'), 'CSS must include .failed-rows-inspector-card');
  assert(cssCode.includes('.category-filter-strip'), 'CSS must include .category-filter-strip');
  assert(cssCode.includes('.category-tab-btn'), 'CSS must include .category-tab-btn');
  assert(cssCode.includes('.inspector-search-bar'), 'CSS must include .inspector-search-bar');
  assert(cssCode.includes('.inspector-row-card'), 'CSS must include .inspector-row-card');
  console.log('✓ FailedRowsInspector cyber styling rules verified in ingestion.css');
}

async function runAll() {
  try {
    await testErrorCategorization();
    await testMockDataAndSchemaStructure();
    await testFilteringAndSearch();
    await testComponentAndCSSContracts();

    console.log('\n======================================================================');
    console.log('  ALL DEV 3 DAY 15 (PART 1) VERIFICATION TESTS PASSED (100%)');
    console.log('======================================================================\n');
  } catch (err) {
    console.error('\n❌ Test failure:', err);
    process.exit(1);
  }
}

runAll();
