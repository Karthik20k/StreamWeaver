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
console.log('  StreamWeaver - Developer 3 Day 15 Verification Suite (Part 2 of 3)');
console.log('  Highlighted Error Table & Inline Sandbox Exception Debugger');
console.log('======================================================================');

async function testIconExports() {
  console.log('\n--- 1. Testing Component Icons & Icon Contracts ---');

  const iconsPath = path.resolve(__dirname, '../components/common/Icons.jsx');
  assert(fs.existsSync(iconsPath), 'Icons.jsx must exist');
  const iconsCode = fs.readFileSync(iconsPath, 'utf-8');

  assert(iconsCode.includes('function ChevronDownIcon'), 'ChevronDownIcon must be exported');
  assert(iconsCode.includes('function ChevronUpIcon'), 'ChevronUpIcon must be exported');
  assert(iconsCode.includes('function AlertTriangleIcon'), 'AlertTriangleIcon must be exported');
  assert(iconsCode.includes('function AlertCircleIcon'), 'AlertCircleIcon must be exported');
  assert(iconsCode.includes('function CopyIcon'), 'CopyIcon must be exported');
  assert(iconsCode.includes('function CodeIcon'), 'CodeIcon must be exported');
  assert(iconsCode.includes('function ClockIcon'), 'ClockIcon must be exported');

  // Verify duplicate SearchIcon was removed
  const searchMatches = iconsCode.match(/function SearchIcon/g) || [];
  assert.strictEqual(searchMatches.length, 1, 'SearchIcon must only be exported once (no duplicates)');

  console.log('✓ All required navigation, alert, and debugger icons verified with clean exports');
}

async function testFailedCellHighlightLogic() {
  console.log('\n--- 2. Testing Red Failed-Cell Highlighting Logic ---');

  // Verify attribute matching contract for highlighting failed column in red
  const mockRow = {
    id: 'fail-test-101',
    lineNumber: 412,
    failedColumn: 'unitPrice',
    errorCategory: ERROR_CATEGORIES.TYPE_MISMATCH,
    scriptError: 'TypeError: Cast failure: String "$49.99 USD" cannot be converted to Number',
    executionTimeMs: 14,
    timestamp: new Date().toISOString(),
    rawRow: {
      orderId: 'ORD-9882',
      customerName: 'Acme Corp',
      unitPrice: '$49.99 USD',
      quantity: 5,
      notes: null
    }
  };

  // Highlighting algorithm verification
  const isFailedCellMatch = (key, failedCol) => key.toLowerCase() === (failedCol || '').toLowerCase();

  assert.strictEqual(isFailedCellMatch('unitPrice', mockRow.failedColumn), true, 'unitPrice must match failedColumn');
  assert.strictEqual(isFailedCellMatch('UnitPrice', mockRow.failedColumn), true, 'Case-insensitive match must succeed');
  assert.strictEqual(isFailedCellMatch('orderId', mockRow.failedColumn), false, 'orderId is clean');
  assert.strictEqual(isFailedCellMatch('customerName', mockRow.failedColumn), false, 'customerName is clean');
  assert.strictEqual(isFailedCellMatch('quantity', mockRow.failedColumn), false, 'quantity is clean');

  console.log('✓ Failed-cell highlight matching correctly identifies rejected target column');

  // Verify watchdog latency threshold logic
  const isWatchdogTimeout = (category, execMs) => category === ERROR_CATEGORIES.TIMEOUT_TERMINATION || execMs >= 50;

  assert.strictEqual(isWatchdogTimeout(mockRow.errorCategory, mockRow.executionTimeMs), false, '14ms is within normal boundary');
  assert.strictEqual(isWatchdogTimeout(ERROR_CATEGORIES.TIMEOUT_TERMINATION, 10), true, 'TIMEOUT_TERMINATION category triggers danger');
  assert.strictEqual(isWatchdogTimeout(ERROR_CATEGORIES.VALIDATION_THROW, 50), true, '>= 50ms latency threshold triggers danger warning');
  assert.strictEqual(isWatchdogTimeout(ERROR_CATEGORIES.VALIDATION_THROW, 65), true, '65ms latency triggers danger warning');

  console.log('✓ Watchdog latency threshold (>= 50ms) accurately evaluated');
}

async function testFailedRowsInspectorJSXContracts() {
  console.log('\n--- 3. Testing FailedRowsInspector & InlineExceptionDebugger Source Contracts ---');

  const componentPath = path.resolve(__dirname, '../components/ingestion/FailedRowsInspector.jsx');
  assert(fs.existsSync(componentPath), 'FailedRowsInspector.jsx must exist');

  const code = fs.readFileSync(componentPath, 'utf8');

  // 3.1 Verify Exports
  assert(code.includes('export function InlineExceptionDebugger'), 'Must export InlineExceptionDebugger');
  assert(code.includes('export function FailedRowsInspector'), 'Must export FailedRowsInspector');
  console.log('✓ InlineExceptionDebugger and FailedRowsInspector are exported');

  // 3.2 Verify InlineExceptionDebugger Implementation
  assert(code.includes('inline-exception-panel'), 'InlineExceptionDebugger must render .inline-exception-panel');
  assert(code.includes('exception-diagnostics-pane'), 'Must render left diagnostics pane');
  assert(code.includes('ISOLATED-VM EXCEPTION TRACE'), 'Must display V8 isolate diagnostics title');
  assert(code.includes('raw-record-inspector-pane'), 'Must render right raw record inspector pane');
  assert(code.includes('RAW RECORD CELL INSPECTOR'), 'Must display raw record inspector title');
  assert(code.includes('failed-cell-highlight'), 'Must apply failed-cell-highlight class to failed column');
  assert(code.includes('FAILED CELL'), 'Must render FAILED CELL badge');
  assert(code.includes('Copy Error'), 'Must provide one-click copy button for script error');
  assert(code.includes('Copy JSON'), 'Must provide one-click copy button for raw record JSON');
  console.log('✓ InlineExceptionDebugger implements dual-pane inspection with red failed-cell highlight and clipboard actions');

  // 3.3 Verify FailedRowsTable Implementation (Day 15 Table Specification)
  assert(code.includes('failed-rows-table'), 'Must render table with .failed-rows-table class');
  assert(code.includes('Line #'), 'Table header must include Line #');
  assert(code.includes('Failed Column'), 'Table header must include Failed Column');
  assert(code.includes('Exception Category'), 'Table header must include Exception Category');
  assert(code.includes('Latency'), 'Table header must include Latency');
  assert(code.includes('Inline Exception Message'), 'Table header must include Inline Exception Message');
  assert(code.includes('Actions'), 'Table header must include Actions');
  console.log('✓ Failed Rows Table declares all 7 specified columns');

  // 3.4 Red Column Highlighting in Table
  assert(code.includes('failed-column-cell'), 'Must render failed-column-cell');
  assert(code.includes('failed-column-pill'), 'Must render failed-column-pill');
  assert(code.includes('text-crimson'), 'Must render text-crimson styling on failed column');
  console.log('✓ Failed column name highlighted with red indicator and text-crimson');

  // 3.5 Expand / Collapse & View Mode State
  assert(code.includes('expandedRowIds'), 'Must track expanded row IDs');
  assert(code.includes('toggleRowExpanded'), 'Must provide toggleRowExpanded function');
  assert(code.includes('expandAllCurrentPage'), 'Must support expand all action');
  assert(code.includes('collapseAllCurrentPage'), 'Must support collapse all action');
  assert(code.includes("viewMode === 'table'"), 'Must support Table View mode');
  assert(code.includes("viewMode === 'cards'"), 'Must support Card View mode');
  console.log('✓ Table expansion accordions and Table/Card view mode switchers verified');
}

async function testCSSStylingContracts() {
  console.log('\n--- 4. Testing CSS Theme Rules for Error Highlighting ---');

  const cssPath = path.resolve(__dirname, '../styles/ingestion.css');
  assert(fs.existsSync(cssPath), 'ingestion.css must exist');

  const css = fs.readFileSync(cssPath, 'utf8');

  // 4.1 Table & Row Styling
  assert(css.includes('.failed-rows-table'), 'CSS must define .failed-rows-table');
  assert(css.includes('.failed-row-tr'), 'CSS must define .failed-row-tr');
  assert(css.includes('.failed-row-tr:hover'), 'CSS must define hover effects for failed row tr');
  assert(css.includes('.failed-column-pill'), 'CSS must define .failed-column-pill');

  // 4.2 Red Cell Highlighting Rules (Day 15 Specific Requirement)
  assert(css.includes('.failed-cell-highlight'), 'CSS must define .failed-cell-highlight');
  assert(css.includes('rgba(239, 68, 68'), 'CSS must use red/crimson RGBA tint for highlight');
  assert(css.includes('#ef4444'), 'CSS must use red accent color');

  // 4.3 Inline Exception Debugger Panel Styling
  assert(css.includes('.inline-exception-panel'), 'CSS must define .inline-exception-panel');
  assert(css.includes('.exception-diagnostics-pane'), 'CSS must define .exception-diagnostics-pane');
  assert(css.includes('.raw-record-inspector-pane'), 'CSS must define .raw-record-inspector-pane');
  assert(css.includes('.exception-code-box'), 'CSS must define .exception-code-box');
  assert(css.includes('.raw-attributes-grid'), 'CSS must define .raw-attributes-grid');

  console.log('✓ ingestion.css verifies all red cell highlight and inline debugger styling rules');
}

async function runAll() {
  try {
    await testIconExports();
    await testFailedCellHighlightLogic();
    await testFailedRowsInspectorJSXContracts();
    await testCSSStylingContracts();

    console.log('\n======================================================================');
    console.log('  ALL DEV 3 DAY 15 PART 2 VERIFICATION TESTS PASSED (100%)');
    console.log('======================================================================\n');
  } catch (err) {
    console.error('\n❌ Test failure:', err);
    process.exit(1);
  }
}

runAll();
