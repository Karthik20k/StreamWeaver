import React, { useState } from 'react';
import { Button } from '../common/Button';
import {
  PlayIcon,
  PauseIcon,
  StopCircleIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
  ZapIcon,
  XIcon,
  ActivityIcon,
  CheckCircleIcon
} from '../common/Icons';

/**
 * Abort Confirmation Modal Dialog
 * Confirms with the user before destroying isolated-vm context and aborting stream
 */
export function AbortConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  jobId,
  rowsProcessed = 0,
  totalRows = 0,
  wsConnected = false
}) {
  const [abortReason, setAbortReason] = useState('Manual operator intervention');

  if (!isOpen) return null;

  return (
    <div className="abort-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="abort-modal-title">
      <div className="abort-modal-dialog">
        <div className="abort-modal-header">
          <div className="abort-modal-icon-badge">
            <AlertTriangleIcon size={24} className="text-crimson" />
          </div>
          <div>
            <h3 id="abort-modal-title">Confirm Stream Termination</h3>
            <p className="abort-modal-subtitle">
              Immediate isolate shutdown & pipeline abort
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <XIcon size={16} />
          </button>
        </div>

        <div className="abort-modal-body">
          <div className="abort-warning-callout">
            <p>
              Are you sure you want to abort the current ingestion pipeline?
            </p>
            <p className="callout-subtext">
              An immediate termination signal (<code>ABORT_STREAM</code>) will be dispatched over WebSockets to Developer 1's backend to kill the <code>isolated-vm</code> context and purge in-flight batch buffers.
            </p>
          </div>

          <div className="abort-telemetry-summary">
            <div className="summary-item">
              <span className="summary-label">ACTIVE JOB ID</span>
              <span className="summary-value font-mono">{jobId || 'N/A'}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">RECORDS PROCESSED</span>
              <span className="summary-value font-mono text-cyan">
                {rowsProcessed.toLocaleString()} / {totalRows > 0 ? totalRows.toLocaleString() : '50,000'}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">WEBSOCKET SIGNAL LINK</span>
              <span className={`summary-value font-mono ${wsConnected ? 'text-emerald' : 'text-amber'}`}>
                {wsConnected ? '● WS ARMED (Dev 1)' : '○ FALLBACK DISPATCH'}
              </span>
            </div>
          </div>

          <div className="abort-reason-field">
            <label htmlFor="abort-reason-select">Select Termination Reason:</label>
            <select
              id="abort-reason-select"
              value={abortReason}
              onChange={(e) => setAbortReason(e.target.value)}
              className="abort-select-input"
            >
              <option value="Manual operator intervention">Manual operator intervention</option>
              <option value="Target collection mapping adjustment required">Target collection mapping adjustment required</option>
              <option value="High error rate / script exception observed">High error rate / script exception observed</option>
              <option value="Emergency pipeline halt">Emergency pipeline halt</option>
            </select>
          </div>
        </div>

        <div className="abort-modal-footer">
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
          >
            Nevermind, Keep Streaming
          </Button>

          <Button
            variant="danger"
            size="md"
            icon={StopCircleIcon}
            onClick={() => onConfirm(abortReason)}
          >
            Confirm Abort Stream
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * IngestionControlCenter
 * Interactive Execution Controls: "Pause Ingestion", "Resume", "Abort Stream"
 * Dispatches immediate termination signal over WebSockets to Developer 1's backend
 * Dev 3 Day 14 Deliverable
 */
export function IngestionControlCenter({
  status = 'idle',
  isPaused = false,
  isProcessing = false,
  terminalState = null,
  jobId = null,
  rowsProcessed = 0,
  totalRows = 0,
  wsStatus = 'connected',
  onPause = null,
  onResume = null,
  onAbort = null,
  onRestart = null,
  className = ''
}) {
  const [isAbortModalOpen, setIsAbortModalOpen] = useState(false);
  const [signalFeedback, setSignalFeedback] = useState(null);

  const wsConnected = wsStatus === 'connected';

  const triggerPause = () => {
    if (onPause) {
      onPause();
      setSignalFeedback('PAUSE_STREAM signal dispatched');
      setTimeout(() => setSignalFeedback(null), 2500);
    }
  };

  const triggerResume = () => {
    if (onResume) {
      onResume();
      setSignalFeedback('RESUME_STREAM signal dispatched');
      setTimeout(() => setSignalFeedback(null), 2500);
    }
  };

  const handleConfirmAbort = (reason) => {
    setIsAbortModalOpen(false);
    if (onAbort) {
      onAbort(reason);
      setSignalFeedback(`ABORT_STREAM dispatched (${reason})`);
      setTimeout(() => setSignalFeedback(null), 3000);
    }
  };

  return (
    <div className={`ingestion-control-center-card ${className}`}>
      <div className="control-center-header">
        <div className="control-title-block">
          <div className="control-icon-orb">
            <ActivityIcon size={18} className="text-cyan" />
          </div>
          <div>
            <div className="control-title-row">
              <h4>Pipeline Execution Control Center</h4>
              <span className={`control-status-badge is-${status}`}>
                <span className="control-pulse-dot" />
                <span>
                  {isPaused ? 'EXECUTION PAUSED' :
                   isProcessing ? 'STREAMING ACTIVE' :
                   terminalState ? terminalState.toUpperCase().replace('_', ' ') : status.toUpperCase()}
                </span>
              </span>
            </div>
            <p className="control-subtitle">
              Live operator intervention layer: coordinate pause, resume, and immediate isolate abortion
            </p>
          </div>
        </div>

        {/* Live Signal Feedback Banner */}
        {signalFeedback && (
          <div className="control-signal-ticker" role="status">
            <span className="ticker-dot" />
            <span>{signalFeedback}</span>
          </div>
        )}
      </div>

      {/* Main Execution Action Buttons */}
      <div className="control-actions-toolbar">
        {/* Button 1: Pause Ingestion */}
        {isProcessing && !isPaused && (
          <Button
            variant="secondary"
            size="md"
            icon={PauseIcon}
            onClick={triggerPause}
            className="control-btn-pause"
            title="Pause Ingestion: Halts streaming chunks and holds V8 sandbox buffers in standby"
          >
            Pause Ingestion
          </Button>
        )}

        {/* Button 2: Resume Ingestion */}
        {isPaused && (
          <Button
            variant="primary"
            size="md"
            icon={PlayIcon}
            onClick={triggerResume}
            className="control-btn-resume"
            title="Resume Ingestion: Continue stream chunk processing through isolate"
          >
            Resume Stream
          </Button>
        )}

        {/* Button 3: Abort Stream */}
        {(isProcessing || isPaused) && (
          <Button
            variant="danger"
            size="md"
            icon={StopCircleIcon}
            onClick={() => setIsAbortModalOpen(true)}
            className="control-btn-abort"
            title="Abort Stream: Send immediate termination signal over WebSockets to close isolate and free memory"
          >
            Abort Stream
          </Button>
        )}

        {/* Button 4: Restart Pipeline (Terminal state) */}
        {Boolean(terminalState) && onRestart && (
          <Button
            variant="primary"
            size="md"
            icon={ZapIcon}
            onClick={onRestart}
            className="control-btn-restart"
            title="Restart Ingestion Pipeline with a new job context"
          >
            Restart Pipeline
          </Button>
        )}
      </div>

      {/* Abort Confirmation Dialog */}
      <AbortConfirmModal
        isOpen={isAbortModalOpen}
        onClose={() => setIsAbortModalOpen(false)}
        onConfirm={handleConfirmAbort}
        jobId={jobId}
        rowsProcessed={rowsProcessed}
        totalRows={totalRows}
        wsConnected={wsConnected}
      />
    </div>
  );
}
