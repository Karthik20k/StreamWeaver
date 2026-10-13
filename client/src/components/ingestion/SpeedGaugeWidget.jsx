import React, { useMemo } from 'react';
import { calculateSpeedGaugeMetrics } from '../../utils/telemetryCalculations';
import { GaugeIcon, ZapIcon, TrendingUpIcon } from '../common/Icons';

/**
 * SpeedGaugeWidget
 * High-performance dynamic SVG speedometer gauge displaying Rows Processed / Sec
 * Dev 3 Day 12 Deliverable
 */
export function SpeedGaugeWidget({
  processingRate = 0,
  peakRate = 0,
  uploadSpeedMBps = 0,
  status = 'streaming',
  className = ''
}) {
  const metrics = useMemo(() => {
    return calculateSpeedGaugeMetrics(processingRate);
  }, [processingRate]);

  // Radius 65 for arc calculation (center at 90, 85)
  const cx = 90;
  const cy = 85;
  const radius = 62;

  // Arc path generator for semi-circle sweep (-110 deg to +110 deg)
  const polarToCartesian = (centerX, centerY, r, angleInDegrees) => {
    // 0 deg is at top, so shift by -90
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + r * Math.cos(angleInRadians),
      y: centerY + r * Math.sin(angleInRadians)
    };
  };

  const describeArc = (x, y, r, startAngle, endAngle) => {
    const start = polarToCartesian(x, y, r, endAngle);
    const end = polarToCartesian(x, y, r, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return [
      'M', start.x, start.y,
      'A', r, r, 0, largeArcFlag, 0, end.x, end.y
    ].join(' ');
  };

  const bgArcPath = describeArc(cx, cy, radius, -110, 110);
  const activeEndAngle = -110 + metrics.fraction * 220;
  const activeArcPath = describeArc(cx, cy, radius, -110, Math.max(-109, activeEndAngle));

  // Needle tip coordinates
  const needleTip = polarToCartesian(cx, cy, radius - 8, metrics.needleAngle);

  // Ticks markings along the arc
  const ticks = [0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
    const val = Math.round((frac * metrics.maxScale) / 1000);
    const angle = -110 + frac * 220;
    const ptInner = polarToCartesian(cx, cy, radius - 16, angle);
    const ptOuter = polarToCartesian(cx, cy, radius - 10, angle);
    const ptText = polarToCartesian(cx, cy, radius - 24, angle);
    return { val: `${val}k`, ptInner, ptOuter, ptText, angle };
  });

  const isProcessing = status === 'streaming' || status === 'uploading' || status === 'processing';

  return (
    <div className={`speed-gauge-telemetry-widget ${className}`}>
      {/* Widget Header */}
      <div className="telemetry-widget-header">
        <div className="widget-header-title">
          <GaugeIcon size={16} className="text-emerald" />
          <span>Ingestion Velocity Gauge</span>
        </div>

        <div className="speed-tier-badge" style={{ borderColor: metrics.tierColor, color: metrics.tierColor }}>
          <span className="tier-pulse-dot" style={{ backgroundColor: metrics.tierColor }} />
          <span>{metrics.tier}</span>
        </div>
      </div>

      {/* SVG Speedometer Dial Container */}
      <div className="speed-gauge-svg-container">
        <svg
          className="speed-gauge-svg"
          width="190"
          height="145"
          viewBox="0 0 180 135"
        >
          <defs>
            {/* Speed Gradient */}
            <linearGradient id="speedDialGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="50%" stopColor="#10b981" />
              <stop offset="85%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>

            {/* Needle Glow */}
            <filter id="needleGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background Dial Arc */}
          <path
            d={bgArcPath}
            fill="none"
            className="gauge-bg-arc"
            strokeWidth="10"
            strokeLinecap="round"
          />

          {/* Active Velocity Arc */}
          <path
            d={activeArcPath}
            fill="none"
            stroke="url(#speedDialGradient)"
            strokeWidth="10"
            strokeLinecap="round"
            className={`gauge-active-arc ${isProcessing ? 'is-active' : ''}`}
          />

          {/* Scale Ticks & Number Labels */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={t.ptInner.x}
                y1={t.ptInner.y}
                x2={t.ptOuter.x}
                y2={t.ptOuter.y}
                className="gauge-tick-line"
                strokeWidth="1.5"
              />
              <text
                x={t.ptText.x}
                y={t.ptText.y + 3}
                textAnchor="middle"
                className="gauge-tick-text"
              >
                {t.val}
              </text>
            </g>
          ))}

          {/* Dynamic Needle Indicator */}
          <line
            x1={cx}
            y1={cy}
            x2={needleTip.x}
            y2={needleTip.y}
            stroke={metrics.tierColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            filter="url(#needleGlow)"
            className="gauge-needle-line"
          />

          {/* Needle Pivot Center Hub */}
          <circle
            cx={cx}
            cy={cy}
            r="6"
            fill="#0f172a"
            stroke={metrics.tierColor}
            strokeWidth="2.5"
            className="gauge-needle-hub"
          />
        </svg>

        {/* Live Velocity Readout Overlay */}
        <div className="gauge-readout-center">
          <div className="gauge-velocity-row">
            <ZapIcon size={18} className="text-emerald" />
            <span className="gauge-velocity-num">
              {metrics.rate.toLocaleString()}
            </span>
          </div>
          <span className="gauge-velocity-unit">ROWS / SEC</span>
        </div>
      </div>

      {/* Speed Footer Telemetry Strip */}
      <div className="gauge-telemetry-footer">
        <div className="gauge-footer-metric">
          <span className="footer-metric-label">PEAK SPEED</span>
          <span className="footer-metric-val text-emerald">
            {Math.max(peakRate, processingRate).toLocaleString()} r/s
          </span>
        </div>

        <div className="gauge-footer-metric">
          <span className="footer-metric-label">BANDWIDTH</span>
          <span className="footer-metric-val text-cyan">
            {uploadSpeedMBps > 0 ? `${uploadSpeedMBps} MB/s` : 'V8 Memory Pipe'}
          </span>
        </div>

        <div className="gauge-footer-metric">
          <span className="footer-metric-label">SCALE CAP</span>
          <span className="footer-metric-val text-muted">
            {metrics.maxScale.toLocaleString()} r/s
          </span>
        </div>
      </div>
    </div>
  );
}
