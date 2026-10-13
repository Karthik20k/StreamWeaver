/**
 * StreamWeaver - Real-Time Telemetry Calculations
 * Dev 3 Day 12: Real-Time Telemetry Dashboard UI
 * Math & transformation utilities for radial progress, speed gauge, and countdown clock
 */

/**
 * Calculates clamped progress percentage (0 - 100)
 */
export function calculateProgressPercent(current, total) {
  if (!total || total <= 0) return 0;
  if (!current || current <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((current / total) * 100)));
}

/**
 * Calculates SVG stroke-dashoffset for a circle of given radius
 * Circumference = 2 * PI * r
 */
export function calculateStrokeDashOffset(percentage, radius) {
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.min(100, Math.max(0, percentage));
  const offset = circumference - (clampedPct / 100) * circumference;
  return {
    circumference,
    offset: Math.round(offset * 100) / 100
  };
}

/**
 * Computes speed gauge dial angle and tier
 * Dial sweep: -110 degrees (min) to +110 degrees (max) [220 deg range]
 */
export function calculateSpeedGaugeMetrics(processingRate = 0, customMaxRate = 25000) {
  const rate = Math.max(0, processingRate || 0);

  // Dynamic scale auto-expansion if rate exceeds standard max
  let maxScale = customMaxRate;
  if (rate > 50000) {
    maxScale = 100000;
  } else if (rate > 25000) {
    maxScale = 50000;
  }

  // Fraction of max scale (0.0 to 1.0)
  const fraction = Math.min(1, rate / maxScale);

  // Angle from -110 to +110 degrees
  const minAngle = -110;
  const maxAngle = 110;
  const angleRange = maxAngle - minAngle;
  const needleAngle = minAngle + fraction * angleRange;

  // Determine velocity performance tier
  let tier = 'IDLE';
  let tierColor = 'var(--text-muted)';
  if (rate > 20000) {
    tier = 'HYPER-SPEED';
    tierColor = '#a855f7'; // Purple neon
  } else if (rate > 10000) {
    tier = 'TURBO';
    tierColor = '#10b981'; // Emerald
  } else if (rate > 4000) {
    tier = 'HIGH';
    tierColor = '#06b6d4'; // Cyan
  } else if (rate > 500) {
    tier = 'NORMAL';
    tierColor = '#38bdf8'; // Sky blue
  }

  return {
    rate,
    maxScale,
    fraction,
    needleAngle: Math.round(needleAngle * 10) / 10,
    tier,
    tierColor
  };
}

/**
 * Formats seconds into digital timer display (HH:MM:SS or MM:SS)
 */
export function formatCountdownClock(seconds = 0) {
  if (seconds === undefined || seconds === null || isNaN(seconds) || seconds < 0) {
    return '--:--';
  }

  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculates dynamic ETA projection
 */
export function calculateDynamicEta(totalRows, rowsProcessed, processingRate) {
  if (!totalRows || totalRows <= 0) {
    return { remainingRows: 0, etaSeconds: 0, formattedCountdown: '--:--', targetTime: null };
  }

  const remainingRows = Math.max(0, totalRows - rowsProcessed);
  if (remainingRows === 0) {
    return { remainingRows: 0, etaSeconds: 0, formattedCountdown: '00:00', targetTime: null };
  }

  if (!processingRate || processingRate <= 0) {
    return { remainingRows, etaSeconds: 0, formattedCountdown: '--:--', targetTime: null };
  }

  const etaSeconds = Math.ceil(remainingRows / processingRate);
  const formattedCountdown = formatCountdownClock(etaSeconds);
  const targetTime = new Date(Date.now() + etaSeconds * 1000);

  return {
    remainingRows,
    etaSeconds,
    formattedCountdown,
    targetTime
  };
}
