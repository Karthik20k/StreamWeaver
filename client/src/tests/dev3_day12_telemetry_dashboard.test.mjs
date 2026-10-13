process.env.NODE_ENV = 'test';

import assert from 'assert';
import { 
  calculateProgressPercent, 
  calculateStrokeDashOffset,
  calculateSpeedGaugeMetrics,
  formatCountdownClock,
  calculateDynamicEta
} from '../utils/telemetryCalculations.js';

console.log('===============================================================');
console.log('  StreamWeaver - Developer 3 Day 12 Verification Suite');
console.log('  Real-Time Telemetry Dashboard UI (Radial, Gauge, Countdown)');
console.log('===============================================================');

async function testRadialAndLinearProgressCalculations() {
  console.log('\n--- 1. Testing Radial & Linear Progress Bar Calculations ---');

  // 1.1 Percentage Calculations
  assert.strictEqual(calculateProgressPercent(0, 1000), 0);
  assert.strictEqual(calculateProgressPercent(500, 1000), 50);
  assert.strictEqual(calculateProgressPercent(1000, 1000), 100);
  assert.strictEqual(calculateProgressPercent(1500, 1000), 100, 'Must clamp to 100%');
  assert.strictEqual(calculateProgressPercent(-10, 1000), 0, 'Must clamp to 0%');
  assert.strictEqual(calculateProgressPercent(250, 0), 0, 'Zero total returns 0%');

  // Real dataset metrics
  const totalBytes = 25 * 1024 * 1024; // 25 MB
  const bytesUploaded = 15 * 1024 * 1024; // 15 MB
  assert.strictEqual(calculateProgressPercent(bytesUploaded, totalBytes), 60);

  const totalRows = 75000;
  const rowsProcessed = 60000;
  assert.strictEqual(calculateProgressPercent(rowsProcessed, totalRows), 80);
  console.log('✓ Percentage clamping and ratio calculations validated');

  // 1.2 SVG Circumference & Stroke Dashoffset Math
  const outerRadius = 64;
  const outerCircumference = 2 * Math.PI * outerRadius;

  const stroke0 = calculateStrokeDashOffset(0, outerRadius);
  assert(Math.abs(stroke0.circumference - outerCircumference) < 0.01);
  assert(Math.abs(stroke0.offset - outerCircumference) < 0.01, 'At 0%, offset equals full circumference');

  const stroke50 = calculateStrokeDashOffset(50, outerRadius);
  assert(Math.abs(stroke50.offset - outerCircumference * 0.5) < 0.1, 'At 50%, offset equals half circumference');

  const stroke100 = calculateStrokeDashOffset(100, outerRadius);
  assert.strictEqual(stroke100.offset, 0, 'At 100%, offset equals 0');

  // Inner ring: Bytes (Radius 50)
  const innerRadius = 50;
  const innerCircumference = 2 * Math.PI * innerRadius;
  const strokeInner75 = calculateStrokeDashOffset(75, innerRadius);
  assert(Math.abs(strokeInner75.circumference - innerCircumference) < 0.01);
  assert(Math.abs(strokeInner75.offset - innerCircumference * 0.25) < 0.1);

  console.log('✓ Concentric SVG radial ring stroke-dashoffset formulas validated (Radius 64 & 50)');
}

async function testSpeedGaugeDialMetrics() {
  console.log('\n--- 2. Testing Dynamic Speed Gauge (Rows Processed / Sec) ---');

  // 2.1 Idle State
  const idle = calculateSpeedGaugeMetrics(0);
  assert.strictEqual(idle.rate, 0);
  assert.strictEqual(idle.needleAngle, -110, 'Idle needle points to minimum arc angle (-110 deg)');
  assert.strictEqual(idle.tier, 'IDLE');
  console.log(`✓ Idle speed verified: angle=${idle.needleAngle}°, tier=${idle.tier}`);

  // 2.2 Normal State (1,500 rows/sec)
  const normal = calculateSpeedGaugeMetrics(1500);
  assert.strictEqual(normal.rate, 1500);
  assert.strictEqual(normal.tier, 'NORMAL');
  assert(normal.needleAngle > -110 && normal.needleAngle < 0);
  console.log(`✓ Normal velocity (1.5k r/s) verified: angle=${normal.needleAngle}°, tier=${normal.tier}`);

  // 2.3 High Throughput (6,500 rows/sec)
  const high = calculateSpeedGaugeMetrics(6500);
  assert.strictEqual(high.tier, 'HIGH');
  assert(high.needleAngle > -110 && high.needleAngle < 110);
  console.log(`✓ High velocity (6.5k r/s) verified: angle=${high.needleAngle}°, tier=${high.tier}`);

  // 2.4 Turbo State (14,000 rows/sec)
  const turbo = calculateSpeedGaugeMetrics(14000);
  assert.strictEqual(turbo.tier, 'TURBO');
  assert(turbo.fraction > 0.5);
  console.log(`✓ Turbo velocity (14k r/s) verified: angle=${turbo.needleAngle}°, tier=${turbo.tier}`);

  // 2.5 Hyper-Speed State (> 20,000 rows/sec)
  const hyper = calculateSpeedGaugeMetrics(22500);
  assert.strictEqual(hyper.tier, 'HYPER-SPEED');
  console.log(`✓ Hyper-speed velocity (22.5k r/s) verified: angle=${hyper.needleAngle}°, tier=${hyper.tier}`);

  // 2.6 Dynamic Auto-Scale Expansion for Extreme Speeds
  const extreme35k = calculateSpeedGaugeMetrics(35000);
  assert.strictEqual(extreme35k.maxScale, 50000, 'Scale must expand to 50k for 35k rows/sec');

  const extreme75k = calculateSpeedGaugeMetrics(75000);
  assert.strictEqual(extreme75k.maxScale, 100000, 'Scale must expand to 100k for 75k rows/sec');
  console.log('✓ Dynamic auto-scale gauge expansion verified (25k -> 50k -> 100k scale)');
}

async function testCountdownClockAndDynamicEta() {
  console.log('\n--- 3. Testing Running Countdown Clock & Dynamic ETA Engine ---');

  // 3.1 Digital Countdown Clock Formatter
  assert.strictEqual(formatCountdownClock(0), '00:00');
  assert.strictEqual(formatCountdownClock(45), '00:45');
  assert.strictEqual(formatCountdownClock(125), '02:05');
  assert.strictEqual(formatCountdownClock(3600), '01:00:00');
  assert.strictEqual(formatCountdownClock(3665), '01:01:05');
  assert.strictEqual(formatCountdownClock(-5), '--:--');
  assert.strictEqual(formatCountdownClock(null), '--:--');
  console.log('✓ Digital countdown clock string formatter verified (MM:SS and HH:MM:SS)');

  // 3.2 Dynamic ETA Calculation
  const totalRows = 100000;
  const rowsProcessed = 40000;
  const processingRate = 12000; // 12,000 rows / sec

  const eta1 = calculateDynamicEta(totalRows, rowsProcessed, processingRate);
  assert.strictEqual(eta1.remainingRows, 60000);
  assert.strictEqual(eta1.etaSeconds, 5, '60,000 remaining / 12,000 r/s = 5 seconds');
  assert.strictEqual(eta1.formattedCountdown, '00:05');
  assert(eta1.targetTime instanceof Date);
  assert(eta1.targetTime.getTime() > Date.now());
  console.log(`✓ Dynamic ETA calculated correctly: ${eta1.remainingRows} rows remaining @ ${processingRate} r/s => ~${eta1.etaSeconds}s (${eta1.formattedCountdown})`);

  // 3.3 Dynamic ETA when Processing Rate Drops
  const slowerRate = 2000; // 2,000 rows / sec
  const eta2 = calculateDynamicEta(totalRows, rowsProcessed, slowerRate);
  assert.strictEqual(eta2.etaSeconds, 30, '60,000 remaining / 2,000 r/s = 30 seconds');
  assert.strictEqual(eta2.formattedCountdown, '00:30');
  console.log(`✓ Rate drop dynamically updates countdown velocity: ${eta2.formattedCountdown}`);

  // 3.4 Completed Pipeline Handling
  const completed = calculateDynamicEta(totalRows, totalRows, processingRate);
  assert.strictEqual(completed.remainingRows, 0);
  assert.strictEqual(completed.etaSeconds, 0);
  assert.strictEqual(completed.formattedCountdown, '00:00');
  console.log('✓ Terminal completion state verified (00:00)');

  // 3.5 Buffering / Zero Velocity Edge Case
  const buffering = calculateDynamicEta(totalRows, 1000, 0);
  assert.strictEqual(buffering.etaSeconds, 0);
  assert.strictEqual(buffering.formattedCountdown, '--:--');
  console.log('✓ Zero-velocity buffering state gracefully handled (--:--)');
}

async function testComponentExports() {
  console.log('\n--- 4. Testing Component Exports & Module Contracts ---');

  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  const radialPath = path.resolve(__dirname, '../components/ingestion/RadialProgressBar.jsx');
  const speedPath = path.resolve(__dirname, '../components/ingestion/SpeedGaugeWidget.jsx');
  const countdownPath = path.resolve(__dirname, '../components/ingestion/CountdownClockWidget.jsx');
  const dashboardPath = path.resolve(__dirname, '../components/ingestion/IngestionDashboardStage.jsx');

  assert(fs.existsSync(radialPath), 'RadialProgressBar.jsx must exist');
  assert(fs.existsSync(speedPath), 'SpeedGaugeWidget.jsx must exist');
  assert(fs.existsSync(countdownPath), 'CountdownClockWidget.jsx must exist');
  assert(fs.existsSync(dashboardPath), 'IngestionDashboardStage.jsx must exist');

  const radialCode = fs.readFileSync(radialPath, 'utf-8');
  assert(radialCode.includes('export function RadialProgressBar'), 'RadialProgressBar must be exported');
  assert(radialCode.includes('radial-active-ring'), 'RadialProgressBar must render radial ring SVG');

  const speedCode = fs.readFileSync(speedPath, 'utf-8');
  assert(speedCode.includes('export function SpeedGaugeWidget'), 'SpeedGaugeWidget must be exported');
  assert(speedCode.includes('ROWS / SEC'), 'SpeedGaugeWidget must display ROWS / SEC velocity metric');

  const countdownCode = fs.readFileSync(countdownPath, 'utf-8');
  assert(countdownCode.includes('export function CountdownClockWidget'), 'CountdownClockWidget must be exported');
  assert(countdownCode.includes('clock-digit-display'), 'CountdownClockWidget must render countdown clock face');

  const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
  assert(dashboardCode.includes('<RadialProgressBar'), 'IngestionDashboardStage must embed RadialProgressBar');
  assert(dashboardCode.includes('<SpeedGaugeWidget'), 'IngestionDashboardStage must embed SpeedGaugeWidget');
  assert(dashboardCode.includes('<CountdownClockWidget'), 'IngestionDashboardStage must embed CountdownClockWidget');

  console.log('✓ All Day 12 telemetry UI components verified and embedded in IngestionDashboardStage');
}

async function runAll() {
  try {
    await testRadialAndLinearProgressCalculations();
    await testSpeedGaugeDialMetrics();
    await testCountdownClockAndDynamicEta();
    await testComponentExports();

    console.log('\n===============================================================');
    console.log('  ALL DEV 3 DAY 12 VERIFICATION TESTS PASSED (100%)');
    console.log('===============================================================\n');
  } catch (err) {
    console.error('\n❌ Test failure:', err);
    process.exit(1);
  }
}

runAll();
