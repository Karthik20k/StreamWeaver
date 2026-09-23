import Papa from 'papaparse';
import { calculateColumnWidths } from '../utils/columnAutoSizer.js';
import { SAMPLE_DATASETS } from '../utils/sampleDatasets.js';

const dataset = SAMPLE_DATASETS[0];
const sample = dataset.generateContent();
const lines = sample.content.split('\n');
if (lines.length < 1000) {
  throw new Error(`Sample dataset only produced ${lines.length} lines`);
}

const t0 = performance.now();
const parsed = Papa.parse(sample.content, {
  header: true,
  preview: 1000,
  skipEmptyLines: 'greedy',
  dynamicTyping: true
});
const t1 = performance.now();
if (parsed.data.length !== 1000 || parsed.meta.fields.length !== 9) {
  throw new Error('Failed to extract 1,000 preview rows');
}

const sizing = calculateColumnWidths(parsed.meta.fields, parsed.data);
if (sizing.columnWidths.length !== 9 || sizing.totalWidth <= 1000) {
  throw new Error('Column width calculation failed');
}

const benchmarkHeaders = ['txn_id', 'user_id', 'amount', 'currency', 'status', 'ts'];
const benchmarkLines = [benchmarkHeaders.join(',')];
for (let i = 1; i <= 1000; i++) {
  benchmarkLines.push(`TX-${i},U-${100 + (i % 20)},${(10 + i * 2.5).toFixed(2)},USD,COMPLETED,2026-09-17`);
}
const bmCsv = benchmarkLines.join('\n');
const tb0 = performance.now();
const bmParsed = Papa.parse(bmCsv, {
  header: true,
  preview: 1000,
  skipEmptyLines: 'greedy',
  dynamicTyping: true
});
const tb1 = performance.now();
const totalMs = tb1 - tb0;

if (totalMs >= 300) {
  throw new Error(`Benchmark SLA exceeded: ${totalMs}ms >= 300ms`);
}

console.log('All tests passed.');
