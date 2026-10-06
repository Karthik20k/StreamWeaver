import React, { useMemo } from 'react';
import { 
  formatCountdownClock, 
  calculateDynamicEta 
} from '../../utils/telemetryCalculations';
import { ClockIcon, CheckCircleIcon, ZapIcon, ActivityIcon } from '../common/Icons';

/**
 * CountdownClockWidget
 * Real-time countdown clock and dynamic ETA calculator responding to active processing velocity
 * Dev 3 Day 12 Deliverable
 */
export function CountdownClockWidget({
  etaSeconds = 0,
  elapsedSeconds = 0,
  totalRows = 0,
  rowsProcessed = 0,
  processingRate = 0,
  status = 'streaming',
  className = ''
}) {
  const etaInfo = useMemo(() => {
    return calculateDynamicEta(totalRows, rowsProcessed, processingRate);
  }, [totalRows, rowsProcessed, processingRate]);

  // Use hook etaSeconds if provided, otherwise derived
  const activeEtaSec = etaSeconds > 0 ? etaSeconds : etaInfo.etaSeconds;
  const countdownFormatted = formatCountdownClock(activeEtaSec);

  const formatElapsed = (sec) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isCompleted = status === 'completed';
  const isProcessing = status === 'streaming' || status === 'uploading' || status === 'processing';
  const isAborted = status === 'aborted';

  // Projected completion time string
  const targetTimeStr = useMemo(() => {
    if (isCompleted) return 'Finished';
    if (!isProcessing || activeEtaSec <= 0) return 'Estimating...';
    const target = new Date(Date.now() + activeEtaSec * 1000);
    return target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [isCompleted, isProcessing, activeEtaSec]);

  const remainingRows = Math.max(0, totalRows - rowsProcessed);

  return (
    <div className={`countdown-clock-telemetry-widget ${className}`}>
      {/* Widget Header */}
      <div className="telemetry-widget-header">
        <div className="widget-header-title">
          <ClockIcon size={16} className="text-amber" />
          <span>Dynamic ETA & Clock</span>
        </div>

        <div className="clock-status-pill">
          {isCompleted ? (
            <span className="clock-pill-badge complete">
              <CheckCircleIcon size={12} /> Finished
            </span>
          ) : isProcessing ? (
            <span className="clock-pill-badge active">
              <span className="clock-pulse-dot" /> Live Ticker
            </span>
          ) : (
            <span className="clock-pill-badge idle">
              {isAborted ? 'Aborted' : 'Paused'}
            </span>
          )}
        </div>
      </div>

      {/* Main Countdown Display */}
      <div className="countdown-main-card">
        <div className="countdown-clock-face">
          <div className="clock-face-header">
            <span className="clock-face-label">TIME REMAINING (ESTIMATED)</span>
          </div>

          <div className="clock-digit-display">
            {isCompleted ? (
              <span className="clock-digit-complete">00:00</span>
            ) : isProcessing && activeEtaSec > 0 ? (
              <span className="clock-digits text-amber">{countdownFormatted}</span>
            ) : isProcessing ? (
              <span className="clock-digits-calculating">CALCULATING...</span>
            ) : (
              <span className="clock-digits text-muted">--:--</span>
            )}
          </div>

          <div className="clock-sub-target">
            <span className="target-label">Target Completion:</span>
            <span className="target-val">{targetTimeStr}</span>
          </div>
        </div>
      </div>

      {/* Running Timers & Velocity Breakdown */}
      <div className="countdown-details-grid">
        {/* Elapsed Timer */}
        <div className="countdown-detail-item">
          <span className="detail-item-label">ELAPSED TIME</span>
          <span className="detail-item-val text-cyan">
            {formatElapsed(elapsedSeconds)}
          </span>
        </div>

        {/* Velocity Projection */}
        <div className="countdown-detail-item">
          <span className="detail-item-label">CURRENT PACE</span>
          <span className="detail-item-val text-emerald">
            {processingRate > 0 ? `~${(processingRate / 1000).toFixed(1)}k /s` : 'Buffering'}
          </span>
        </div>

        {/* Remaining Records */}
        <div className="countdown-detail-item">
          <span className="detail-item-label">REMAINING ROWS</span>
          <span className="detail-item-val">
            {remainingRows.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
