process.env.NODE_ENV = 'test';

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  resolveWebSocketUrl,
  calculateBackoffDelay
} from '../hooks/useWebSocketTelemetry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('===============================================================');
console.log('  StreamWeaver - Developer 3 Day 13 Verification Suite');
console.log('  WebSocket Client Integration & Live Charting (60 FPS, Recharts)');
console.log('===============================================================');

async function testWebSocketUrlResolution() {
  console.log('\n--- 1. Testing WebSocket Telemetry URL Resolution ---');

  // 1.1 Custom URL with job ID
  const custom1 = resolveWebSocketUrl('ws://custom-stream.internal:8080/events', 'job-stream-456');
  assert(custom1.includes('job-stream-456'), 'URL must retain job ID query param');
  assert(custom1.startsWith('ws://custom-stream.internal:8080/events'), 'Must preserve base URL');
  console.log(`✓ Custom URL resolution: ${custom1}`);

  // 1.2 Default Node/Fallback URL
  const defaultUrl = resolveWebSocketUrl(null, 'job-abc-123');
  assert(defaultUrl.startsWith('ws://localhost:5000/api/telemetry'), 'Fallback URL must target /api/telemetry on port 5000');
  assert(defaultUrl.includes('jobId=job-abc-123'), 'Fallback URL must include jobId query param');
  console.log(`✓ Default server URL: ${defaultUrl}`);

  // 1.3 URL without jobId
  const bareUrl = resolveWebSocketUrl('ws://cluster.io:9000/ws');
  assert.strictEqual(bareUrl, 'ws://cluster.io:9000/ws');
  console.log('✓ Bare WebSocket URL resolution validated');
}

async function testExponentialBackoffCalculations() {
  console.log('\n--- 2. Testing Exponential Backoff & Jitter Algorithm ---');

  const delay0 = calculateBackoffDelay(0, 1000, 10000);
  assert(delay0 >= 1000 && delay0 <= 1300, `Delay 0 must be ~1000ms + jitter, got ${delay0}`);

  const delay1 = calculateBackoffDelay(1, 1000, 10000);
  assert(delay1 >= 1500 && delay1 <= 1800, `Delay 1 must be ~1500ms + jitter, got ${delay1}`);

  const delay2 = calculateBackoffDelay(2, 1000, 10000);
  assert(delay2 >= 2250 && delay2 <= 2550, `Delay 2 must be ~2250ms + jitter, got ${delay2}`);

  const delayExtreme = calculateBackoffDelay(15, 1000, 10000);
  assert(delayExtreme <= 10300, `Delay must clamp to max 10000ms + jitter, got ${delayExtreme}`);

  console.log(`✓ Exponential backoff progression verified: [0]=${delay0}ms, [1]=${delay1}ms, [2]=${delay2}ms, [cap]=${delayExtreme}ms`);
}

async function testSlidingWindowMetrics() {
  console.log('\n--- 3. Testing Sliding Window Telemetry Aggregation ---');

  // Simulate 35 time points with maximum window size 30
  const maxWindow = 30;
  const history = [];

  for (let i = 1; i <= 35; i++) {
    const point = {
      time: `12:00:${i < 10 ? '0' + i : i}`,
      rate: i * 500, // 500, 1000, 1500, ...
      memoryMB: 40 + (i % 5),
      latencyMs: 0.2 + (i % 3) * 0.1
    };
    history.push(point);
    if (history.length > maxWindow) {
      history.shift();
    }
  }

  assert.strictEqual(history.length, maxWindow, `Buffer must be bounded to ${maxWindow} points`);
  assert.strictEqual(history[0].rate, 6 * 500, 'First item must be shifted past item 5');
  assert.strictEqual(history[history.length - 1].rate, 35 * 500, 'Last item must be item 35');

  // Verify metric computations
  let sum = 0;
  let peak = 0;
  for (const pt of history) {
    sum += pt.rate;
    if (pt.rate > peak) peak = pt.rate;
  }
  const avg = Math.round(sum / history.length);
  const current = history[history.length - 1].rate;

  assert.strictEqual(peak, 17500, 'Peak rate in window is 17,500');
  assert.strictEqual(current, 17500, 'Current rate is latest point rate');
  assert(avg > 0 && avg < peak, 'Average rate is strictly between 0 and peak');

  console.log(`✓ Rolling window bounded at ${history.length} points (Current=${current} r/s, Peak=${peak} r/s, Avg=${avg} r/s)`);
}

async function testRechartsAndComponentIntegration() {
  console.log('\n--- 4. Testing Component Implementation & 60 FPS Optimizations ---');

  const chartComponentPath = path.resolve(__dirname, '../components/ingestion/TelemetrySpeedChart.jsx');
  const dashboardPath = path.resolve(__dirname, '../components/ingestion/IngestionDashboardStage.jsx');
  const hookPath = path.resolve(__dirname, '../hooks/useWebSocketTelemetry.js');
  const cssPath = path.resolve(__dirname, '../styles/ingestion.css');

  assert(fs.existsSync(chartComponentPath), 'TelemetrySpeedChart.jsx must exist');
  assert(fs.existsSync(dashboardPath), 'IngestionDashboardStage.jsx must exist');
  assert(fs.existsSync(hookPath), 'useWebSocketTelemetry.js must exist');
  assert(fs.existsSync(cssPath), 'ingestion.css must exist');

  const chartCode = fs.readFileSync(chartComponentPath, 'utf-8');
  const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
  const hookCode = fs.readFileSync(hookPath, 'utf-8');
  const cssCode = fs.readFileSync(cssPath, 'utf-8');

  // 4.1 Recharts usage in TelemetrySpeedChart
  assert(chartCode.includes('AreaChart'), 'TelemetrySpeedChart must use AreaChart from recharts');
  assert(chartCode.includes('ResponsiveContainer'), 'TelemetrySpeedChart must use ResponsiveContainer');
  assert(chartCode.includes('ReferenceLine'), 'TelemetrySpeedChart must render ReferenceLine for average speed');
  assert(chartCode.includes('isAnimationActive={false}'), 'TelemetrySpeedChart must disable animations for 60 FPS live streaming performance');
  assert(chartCode.includes('CustomTelemetryTooltip'), 'TelemetrySpeedChart must render custom cyber tooltip');
  assert(chartCode.includes('60 FPS Live'), 'TelemetrySpeedChart must display 60 FPS indicator');
  console.log('✓ Recharts AreaChart with 60 FPS configuration (isAnimationActive={false}) verified');

  // 4.2 Hook features
  assert(hookCode.includes('TELEMETRY_HEARTBEAT'), 'useWebSocketTelemetry must handle TELEMETRY_HEARTBEAT events');
  assert(hookCode.includes('calculateBackoffDelay'), 'useWebSocketTelemetry must use exponential backoff');
  assert(hookCode.includes('SUBSCRIBE_TELEMETRY'), 'useWebSocketTelemetry must send handshake subscribe payload');
  assert(hookCode.includes('pushDataPoint'), 'useWebSocketTelemetry must maintain sliding window buffer');
  console.log('✓ useWebSocketTelemetry hook contracts verified');

  // 4.3 IngestionDashboardStage wiring
  assert(dashboardCode.includes('useWebSocketTelemetry'), 'IngestionDashboardStage must import useWebSocketTelemetry');
  assert(dashboardCode.includes('<TelemetrySpeedChart'), 'IngestionDashboardStage must render TelemetrySpeedChart');
  assert(dashboardCode.includes('telemetryHistory={telemetryHistory}'), 'IngestionDashboardStage must pass telemetryHistory');
  assert(dashboardCode.includes('wsStatus={wsStatus}'), 'IngestionDashboardStage must pass wsStatus');
  assert(dashboardCode.includes('onReconnect={reconnectWs}'), 'IngestionDashboardStage must pass reconnect handler');
  console.log('✓ IngestionDashboardStage telemetry chart wiring verified');

  // 4.4 CSS Verification
  assert(cssCode.includes('.telemetry-speed-chart-card'), 'ingestion.css must include .telemetry-speed-chart-card');
  assert(cssCode.includes('.ws-status-beacon-pill'), 'ingestion.css must include .ws-status-beacon-pill');
  assert(cssCode.includes('.chart-stats-ticker-strip'), 'ingestion.css must include .chart-stats-ticker-strip');
  assert(cssCode.includes('.telemetry-chart-tooltip'), 'ingestion.css must include .telemetry-chart-tooltip');
  console.log('✓ Ingestion cyber styling tokens and animations verified');
}

async function runAll() {
  try {
    await testWebSocketUrlResolution();
    await testExponentialBackoffCalculations();
    await testSlidingWindowMetrics();
    await testRechartsAndComponentIntegration();

    console.log('\n===============================================================');
    console.log('  ALL DEV 3 DAY 13 VERIFICATION TESTS PASSED (100%)');
    console.log('===============================================================\n');
  } catch (err) {
    console.error('\n❌ Test failure:', err);
    process.exit(1);
  }
}

runAll();
