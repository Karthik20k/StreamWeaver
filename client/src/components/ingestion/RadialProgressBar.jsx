import React, { useState } from 'react';
import { 
  calculateProgressPercent, 
  calculateStrokeDashOffset 
} from '../../utils/telemetryCalculations';
import { formatBytes } from '../../utils/fileHelpers';
import { CheckCircleIcon, ActivityIcon, DatabaseIcon } from '../common/Icons';

/**
 * RadialProgressBar
 * Dual-ring radial progress meter & linear bars displaying live percentage of total bytes and rows
 * Dev 3 Day 12 Deliverable
 */
export function RadialProgressBar({
  bytesUploaded = 0,
  totalBytes = 0,
  rowsProcessed = 0,
  totalRows = 0,
  status = 'streaming',
  className = ''
}) {
  const [activeMetric, setActiveMetric] = useState('rows'); // 'rows' | 'bytes'

  const bytesPct = calculateProgressPercent(bytesUploaded, totalBytes);
  const rowsPct = calculateProgressPercent(rowsProcessed, totalRows);

  // Outer ring: Rows Progress (Radius 64, circumference ~402.12)
  const outerRadius = 64;
  const outerStroke = calculateStrokeDashOffset(rowsPct, outerRadius);

  // Inner ring: Bytes Progress (Radius 50, circumference ~314.16)
  const innerRadius = 50;
  const innerStroke = calculateStrokeDashOffset(bytesPct, innerRadius);

  const isCompleted = status === 'completed';
  const isProcessing = status === 'streaming' || status === 'uploading' || status === 'processing';

  const displayedPct = activeMetric === 'rows' ? rowsPct : bytesPct;

  return (
    <div className={`radial-telemetry-widget ${className}`}>
      {/* Widget Header & Metric Switcher */}
      <div className="telemetry-widget-header">
        <div className="widget-header-title">
          <ActivityIcon size={16} className="text-cyan" />
          <span>Stream Progress Ring</span>
        </div>

        <div className="radial-metric-toggle-pills">
          <button
            type="button"
            className={`metric-toggle-pill ${activeMetric === 'rows' ? 'active cyan' : ''}`}
            onClick={() => setActiveMetric('rows')}
            title="Focus ring on record counts"
          >
            Records ({rowsPct}%)
          </button>
          <button
            type="button"
            className={`metric-toggle-pill ${activeMetric === 'bytes' ? 'active purple' : ''}`}
            onClick={() => setActiveMetric('bytes')}
            title="Focus ring on byte stream volume"
          >
            Bytes ({bytesPct}%)
          </button>
        </div>
      </div>

      {/* SVG Radial Meter Container */}
      <div className="radial-svg-container">
        <svg
          className="radial-svg"
          width="180"
          height="180"
          viewBox="0 0 160 160"
        >
          <defs>
            {/* Outer Rows Ring Gradient */}
            <linearGradient id="radialRowsGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>

            {/* Inner Bytes Ring Gradient */}
            <linearGradient id="radialBytesGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>

            {/* Glow Filter */}
            <filter id="radialGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background Track 1 (Outer - Rows) */}
          <circle
            cx="80"
            cy="80"
            r={outerRadius}
            className="radial-bg-track"
            strokeWidth="9"
          />

          {/* Background Track 2 (Inner - Bytes) */}
          <circle
            cx="80"
            cy="80"
            r={innerRadius}
            className="radial-bg-track inner"
            strokeWidth="7"
          />

          {/* Active Outer Ring: Rows Processed */}
          <circle
            cx="80"
            cy="80"
            r={outerRadius}
            stroke="url(#radialRowsGradient)"
            strokeWidth="9"
            strokeLinecap="round"
            fill="transparent"
            strokeDasharray={outerStroke.circumference}
            strokeDashoffset={outerStroke.offset}
            filter="url(#radialGlow)"
            className={`radial-active-ring ${isProcessing ? 'pulsing' : ''}`}
            transform="rotate(-90 80 80)"
          />

          {/* Active Inner Ring: Bytes Uploaded */}
          <circle
            cx="80"
            cy="80"
            r={innerRadius}
            stroke="url(#radialBytesGradient)"
            strokeWidth="7"
            strokeLinecap="round"
            fill="transparent"
            strokeDasharray={innerStroke.circumference}
            strokeDashoffset={innerStroke.offset}
            className="radial-active-ring inner"
            transform="rotate(-90 80 80)"
          />
        </svg>

        {/* Center Content Overlay */}
        <div className="radial-center-content">
          <span className="radial-pct-number">{displayedPct}%</span>
          <span className="radial-metric-caption">
            {activeMetric === 'rows' ? 'RECORDS' : 'DATA'}
          </span>
          <div className="radial-status-badge">
            {isCompleted ? (
              <span className="badge-text success">
                <CheckCircleIcon size={12} /> COMPLETE
              </span>
            ) : (
              <span className="badge-text active">
                <span className="mini-pulse" /> LIVE STREAM
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Dual Synchronized Linear Progress Bars */}
      <div className="radial-linear-bars-stack">
        {/* Bar 1: Rows Processed */}
        <div className="linear-sub-bar-group">
          <div className="linear-sub-label-row">
            <span className="sub-label-name">
              <span className="legend-indicator cyan" />
              Rows Ingested:
            </span>
            <span className="sub-label-val">
              <strong>{rowsProcessed.toLocaleString()}</strong> / {(totalRows || 0).toLocaleString()} ({rowsPct}%)
            </span>
          </div>
          <div className="linear-sub-track">
            <div
              className={`linear-sub-fill cyan ${isProcessing ? 'is-animated' : ''}`}
              style={{ width: `${Math.max(1, rowsPct)}%` }}
            />
          </div>
        </div>

        {/* Bar 2: Bytes Transferred */}
        <div className="linear-sub-bar-group">
          <div className="linear-sub-label-row">
            <span className="sub-label-name">
              <span className="legend-indicator purple" />
              Bytes Streamed:
            </span>
            <span className="sub-label-val">
              <strong>{formatBytes(bytesUploaded)}</strong> / {formatBytes(totalBytes)} ({bytesPct}%)
            </span>
          </div>
          <div className="linear-sub-track">
            <div
              className={`linear-sub-fill purple ${isProcessing ? 'is-animated' : ''}`}
              style={{ width: `${Math.max(1, bytesPct)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
