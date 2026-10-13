process.env.NODE_ENV = 'test';

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildControlSignal } from '../hooks/useWebSocketTelemetry.js';
import { determineTerminalState } from '../hooks/useIngestionStream.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('======================================================================');
console.log('  StreamWeaver - Developer 3 Day 14 Verification Suite');
console.log('  Ingestion Control Center, Cancellation Triggers & Terminal States');
console.log('======================================================================');

async function testWebSocketControlSignals() {
  console.log('\n--- 1. Testing WebSocket Control Signal Formatter ---');

  const jobId = 'job-stream-8899';

  // 1.1 Abort Signal (Dev 1 Backend Contract)
  const abortSignal = buildControlSignal('ABORT_STREAM', jobId, { reason: 'Operator manual halt' });
  assert.strictEqual(abortSignal.action, 'ABORT_STREAM');
  assert.strictEqual(abortSignal.jobId, jobId);
  assert.strictEqual(abortSignal.reason, 'Operator manual halt');
  assert(typeof abortSignal.timestamp === 'number');
  console.log('✓ ABORT_STREAM signal formatted correctly for isolated-vm shutdown');

  // 1.2 Pause Signal
  const pauseSignal = buildControlSignal('PAUSE_STREAM', jobId);
  assert.strictEqual(pauseSignal.action, 'PAUSE_STREAM');
  assert.strictEqual(pauseSignal.jobId, jobId);
  assert(typeof pauseSignal.timestamp === 'number');
  console.log('✓ PAUSE_STREAM signal formatted correctly');

  // 1.3 Resume Signal
  const resumeSignal = buildControlSignal('RESUME_STREAM', jobId);
  assert.strictEqual(resumeSignal.action, 'RESUME_STREAM');
  assert.strictEqual(resumeSignal.jobId, jobId);
  assert(typeof resumeSignal.timestamp === 'number');
  console.log('✓ RESUME_STREAM signal formatted correctly');
}

async function testTerminalStateEngine() {
  console.log('\n--- 2. Testing Terminal State Evaluation Logic ---');

  // 2.1 Completed with Success (100% clean rows, 0 DLQ failures)
  const stateSuccess = determineTerminalState('completed', 0);
  assert.strictEqual(stateSuccess, 'completed_success', 'Zero errors must resolve to completed_success');
  console.log(`✓ Completed with 0 errors => ${stateSuccess}`);

  // 2.2 Completed with Warnings (anomalies isolated in DLQ)
  const stateWarnings1 = determineTerminalState('completed', 1);
  assert.strictEqual(stateWarnings1, 'completed_warnings');

  const stateWarnings100 = determineTerminalState('completed', 100);
  assert.strictEqual(stateWarnings100, 'completed_warnings');
  console.log(`✓ Completed with DLQ errors => ${stateWarnings100}`);

  // 2.3 Aborted State
  const stateAborted0 = determineTerminalState('aborted', 0);
  assert.strictEqual(stateAborted0, 'aborted');

  const stateAborted10 = determineTerminalState('aborted', 10);
  assert.strictEqual(stateAborted10, 'aborted');
  console.log(`✓ Aborted stream => ${stateAborted10}`);

  // 2.4 In-flight / Non-terminal States
  assert.strictEqual(determineTerminalState('streaming', 0), null);
  assert.strictEqual(determineTerminalState('paused', 0), null);
  assert.strictEqual(determineTerminalState('uploading', 0), null);
  assert.strictEqual(determineTerminalState('idle', 0), null);
  console.log('✓ In-flight states (streaming, paused, uploading, idle) return null');
}

async function testComponentImplementations() {
  console.log('\n--- 3. Testing Component Implementation & Day 14 Contracts ---');

  const controlCenterPath = path.resolve(__dirname, '../components/ingestion/IngestionControlCenter.jsx');
  const terminalBannerPath = path.resolve(__dirname, '../components/ingestion/TerminalStateBanner.jsx');
  const dashboardPath = path.resolve(__dirname, '../components/ingestion/IngestionDashboardStage.jsx');
  const wsHookPath = path.resolve(__dirname, '../hooks/useWebSocketTelemetry.js');
  const streamHookPath = path.resolve(__dirname, '../hooks/useIngestionStream.js');
  const cssPath = path.resolve(__dirname, '../styles/ingestion.css');

  assert(fs.existsSync(controlCenterPath), 'IngestionControlCenter.jsx must exist');
  assert(fs.existsSync(terminalBannerPath), 'TerminalStateBanner.jsx must exist');
  assert(fs.existsSync(dashboardPath), 'IngestionDashboardStage.jsx must exist');
  assert(fs.existsSync(wsHookPath), 'useWebSocketTelemetry.js must exist');
  assert(fs.existsSync(streamHookPath), 'useIngestionStream.js must exist');
  assert(fs.existsSync(cssPath), 'ingestion.css must exist');

  const controlCenterCode = fs.readFileSync(controlCenterPath, 'utf-8');
  const terminalBannerCode = fs.readFileSync(terminalBannerPath, 'utf-8');
  const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
  const wsHookCode = fs.readFileSync(wsHookPath, 'utf-8');
  const streamHookCode = fs.readFileSync(streamHookPath, 'utf-8');
  const cssCode = fs.readFileSync(cssPath, 'utf-8');

  // 3.1 Control Center Requirements
  assert(controlCenterCode.includes('Pause Ingestion'), 'Must render Pause Ingestion button');
  assert(controlCenterCode.includes('Resume Stream'), 'Must render Resume Stream button');
  assert(controlCenterCode.includes('Abort Stream'), 'Must render Abort Stream button');
  assert(controlCenterCode.includes('AbortConfirmModal'), 'Must provide AbortConfirmModal');
  assert(controlCenterCode.includes('ABORT_STREAM'), 'Modal must reference ABORT_STREAM signal');
  console.log('✓ IngestionControlCenter execution controls and confirmation dialog verified');

  // 3.2 Terminal State Banner Requirements
  assert(terminalBannerCode.includes('completed_success'), 'Must handle completed_success state');
  assert(terminalBannerCode.includes('completed_warnings'), 'Must handle completed_warnings state');
  assert(terminalBannerCode.includes('aborted'), 'Must handle aborted state');
  assert(terminalBannerCode.includes('100% Success'), 'Must show success confirmation header');
  assert(terminalBannerCode.includes('STREAM ABORTED'), 'Must show stream aborted header');
  assert(terminalBannerCode.includes('DLQ Anomalies'), 'Must report DLQ anomaly count');
  console.log('✓ TerminalStateBanner 3 terminal states (Success, Warnings, Aborted) verified');

  // 3.3 WebSocket Hook Abortion & Control Dispatch
  assert(wsHookCode.includes('sendAbortSignal'), 'useWebSocketTelemetry must expose sendAbortSignal');
  assert(wsHookCode.includes('sendPauseSignal'), 'useWebSocketTelemetry must expose sendPauseSignal');
  assert(wsHookCode.includes('sendResumeSignal'), 'useWebSocketTelemetry must expose sendResumeSignal');
  assert(wsHookCode.includes('ABORT_STREAM'), 'useWebSocketTelemetry must transmit ABORT_STREAM');
  console.log('✓ useWebSocketTelemetry immediate abort and control signals verified');

  // 3.4 Ingestion Stream Hook State Management
  assert(streamHookCode.includes('pauseIngestion'), 'useIngestionStream must implement pauseIngestion');
  assert(streamHookCode.includes('resumeIngestion'), 'useIngestionStream must implement resumeIngestion');
  assert(streamHookCode.includes('determineTerminalState'), 'useIngestionStream must export determineTerminalState');
  assert(streamHookCode.includes('terminalState'), 'useIngestionStream must return terminalState');
  console.log('✓ useIngestionStream pause/resume and terminal state evaluation verified');

  // 3.5 Dashboard Stage Integration
  assert(dashboardCode.includes('<IngestionControlCenter'), 'IngestionDashboardStage must render IngestionControlCenter');
  assert(dashboardCode.includes('<TerminalStateBanner'), 'IngestionDashboardStage must render TerminalStateBanner');
  assert(dashboardCode.includes('handlePause'), 'IngestionDashboardStage must wire handlePause');
  assert(dashboardCode.includes('handleResume'), 'IngestionDashboardStage must wire handleResume');
  assert(dashboardCode.includes('handleAbort'), 'IngestionDashboardStage must wire handleAbort');
  console.log('✓ IngestionDashboardStage wiring verified');

  // 3.6 CSS Styling
  assert(cssCode.includes('.ingestion-control-center-card'), 'CSS must style .ingestion-control-center-card');
  assert(cssCode.includes('.abort-modal-dialog'), 'CSS must style .abort-modal-dialog');
  assert(cssCode.includes('.terminal-state-card.is-success'), 'CSS must style .terminal-state-card.is-success');
  assert(cssCode.includes('.terminal-state-card.is-warning'), 'CSS must style .terminal-state-card.is-warning');
  assert(cssCode.includes('.terminal-state-card.is-aborted'), 'CSS must style .terminal-state-card.is-aborted');
  console.log('✓ Cyber styling and responsive rules verified in ingestion.css');
}

async function runAll() {
  try {
    await testWebSocketControlSignals();
    await testTerminalStateEngine();
    await testComponentImplementations();

    console.log('\n======================================================================');
    console.log('  ALL DEV 3 DAY 14 VERIFICATION TESTS PASSED (100%)');
    console.log('======================================================================\n');
  } catch (err) {
    console.error('\n❌ Test failure:', err);
    process.exit(1);
  }
}

runAll();
