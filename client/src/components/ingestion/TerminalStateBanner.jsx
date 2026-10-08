import React from 'react';
import { Button } from '../common/Button';
import {
  CheckCircleIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  StopCircleIcon,
  ZapIcon,
  SlidersIcon,
  RefreshCwIcon
} from '../common/Icons';

/**
 * TerminalStateBanner
 * Renders the 3 distinct terminal states for the Ingestion Dashboard:
 * 1. Completed with Success (100% clean records, 0 errors)
 * 2. Completed with Warnings (anomalies detected & isolated in DLQ)
 * 3. Aborted (terminated by operator WebSocket abort signal or watchdog)
 * Dev 3 Day 14 Deliverable
 */
export function TerminalStateBanner({
  terminalState, // 'completed_success' | 'completed_warnings' | 'aborted'
  rowsProcessed = 0,
  totalRows = 0,
  errorCount = 0,
  targetCollection = 'ecommerce_orders',
  elapsedSeconds = 0,
  processingRate = 0,
  onAuditErrors = null,
  onRestart = null,
  onBackToMapping = null,
  onProceedToAudit = null,
  className = ''
}) {
  if (!terminalState) return null;

  const formatElapsed = (sec) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // --------------------------------------------------------------------------
  // Terminal State 1: Completed with Success (100% clean, 0 errors)
  // --------------------------------------------------------------------------
  if (terminalState === 'completed_success') {
    return (
      <div className={`terminal-state-card is-success ${className}`}>
        <div className="terminal-header-block">
          <div className="terminal-orb green">
            <CheckCircleIcon size={30} />
          </div>
          <div className="terminal-text-block">
            <div className="terminal-badge-row">
              <span className="terminal-status-pill green">COMPLETED WITH SUCCESS</span>
              <span className="terminal-metric-pill">0 DLQ Anomalies</span>
            </div>
            <h3>Pipeline Ingestion Finalized — 100% Success</h3>
            <p className="terminal-description">
              All <strong>{rowsProcessed.toLocaleString()} records</strong> were successfully transformed via the V8 sandbox and committed to MongoDB collection <code>{targetCollection}</code> with zero validation or runtime exceptions.
            </p>
          </div>
        </div>

        {/* Telemetry Summary Strip */}
        <div className="terminal-stats-strip">
          <div className="stat-box">
            <span className="stat-label">COMMITTED RECORDS</span>
            <span className="stat-val text-emerald font-mono">{rowsProcessed.toLocaleString()}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">TOTAL DURATION</span>
            <span className="stat-val text-cyan font-mono">{formatElapsed(elapsedSeconds)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">FINAL VELOCITY</span>
            <span className="stat-val text-emerald font-mono">{processingRate.toLocaleString()} <small>r/s</small></span>
          </div>
          <div className="stat-box">
            <span className="stat-label">DATA INTEGRITY</span>
            <span className="stat-val text-emerald font-mono">100.0%</span>
          </div>
        </div>

        <div className="terminal-action-row">
          {onBackToMapping && (
            <Button variant="outline" size="md" onClick={onBackToMapping}>
              Back to Mapping
            </Button>
          )}

          {onProceedToAudit && (
            <Button
              variant="primary"
              size="md"
              icon={SlidersIcon}
              onClick={onProceedToAudit}
            >
              Inspect Target Collection &rarr;
            </Button>
          )}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Terminal State 2: Completed with Warnings (anomalies isolated in DLQ)
  // --------------------------------------------------------------------------
  if (terminalState === 'completed_warnings') {
    const totalAttempted = rowsProcessed + errorCount;
    const errorRate = totalAttempted > 0 ? ((errorCount / totalAttempted) * 100).toFixed(2) : '0.00';

    return (
      <div className={`terminal-state-card is-warning ${className}`}>
        <div className="terminal-header-block">
          <div className="terminal-orb amber">
            <AlertCircleIcon size={30} />
          </div>
          <div className="terminal-text-block">
            <div className="terminal-badge-row">
              <span className="terminal-status-pill amber">COMPLETED WITH WARNINGS</span>
              <span className="terminal-metric-pill amber">{errorCount} DLQ Errors Isolated</span>
            </div>
            <h3>Pipeline Completed with Warnings</h3>
            <p className="terminal-description">
              Ingested <strong>{rowsProcessed.toLocaleString()} clean records</strong>, while <strong>{errorCount} anomalous rows</strong> were trapped by sandbox guardrails and safely diverted into the Dead Letter Queue for auditing.
            </p>
          </div>
        </div>

        {/* Telemetry Summary Strip */}
        <div className="terminal-stats-strip">
          <div className="stat-box">
            <span className="stat-label">COMMITTED CLEAN</span>
            <span className="stat-val text-emerald font-mono">{rowsProcessed.toLocaleString()}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">DLQ ANOMALIES</span>
            <span className="stat-val text-amber font-mono">{errorCount}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">EXCEPTION RATE</span>
            <span className="stat-val text-amber font-mono">{errorRate}%</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">ELAPSED TIME</span>
            <span className="stat-val text-cyan font-mono">{formatElapsed(elapsedSeconds)}</span>
          </div>
        </div>

        <div className="terminal-action-row">
          {onRestart && (
            <Button variant="outline" size="md" icon={RefreshCwIcon} onClick={onRestart}>
              Re-run Ingestion
            </Button>
          )}

          {onAuditErrors && (
            <Button
              variant="secondary"
              size="md"
              icon={AlertCircleIcon}
              onClick={onAuditErrors}
            >
              Audit DLQ Errors ({errorCount})
            </Button>
          )}

          {onProceedToAudit && (
            <Button
              variant="primary"
              size="md"
              icon={SlidersIcon}
              onClick={onProceedToAudit}
            >
              Review Dataset & DLQ &rarr;
            </Button>
          )}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Terminal State 3: Aborted (stream terminated by operator or watchdog)
  // --------------------------------------------------------------------------
  if (terminalState === 'aborted') {
    return (
      <div className={`terminal-state-card is-aborted ${className}`}>
        <div className="terminal-header-block">
          <div className="terminal-orb red">
            <StopCircleIcon size={30} />
          </div>
          <div className="terminal-text-block">
            <div className="terminal-badge-row">
              <span className="terminal-status-pill red">STREAM ABORTED</span>
              <span className="terminal-metric-pill red">Isolate Memory Purged</span>
            </div>
            <h3>Streaming Pipeline Aborted by Operator</h3>
            <p className="terminal-description">
              Execution was terminated immediately via WebSocket termination signal. The <code>isolated-vm</code> context was dismantled, in-flight chunks discarded, and memory buffers released. <strong>{rowsProcessed.toLocaleString()} records</strong> were committed prior to abort.
            </p>
          </div>
        </div>

        {/* Telemetry Summary Strip */}
        <div className="terminal-stats-strip">
          <div className="stat-box">
            <span className="stat-label">RECORDS COMMITTED</span>
            <span className="stat-val text-cyan font-mono">{rowsProcessed.toLocaleString()}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">EXECUTION TIME</span>
            <span className="stat-val text-muted font-mono">{formatElapsed(elapsedSeconds)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">DLQ ERRORS AT ABORT</span>
            <span className="stat-val text-amber font-mono">{errorCount}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">BUFFER STATE</span>
            <span className="stat-val text-crimson font-mono">PURGED</span>
          </div>
        </div>

        <div className="terminal-action-row">
          {onBackToMapping && (
            <Button variant="outline" size="md" onClick={onBackToMapping}>
              Return to Mapping
            </Button>
          )}

          {errorCount > 0 && onAuditErrors && (
            <Button variant="secondary" size="md" onClick={onAuditErrors}>
              Audit Partial DLQ Errors ({errorCount})
            </Button>
          )}

          {onRestart && (
            <Button
              variant="primary"
              size="md"
              icon={ZapIcon}
              onClick={onRestart}
            >
              Restart Pipeline (New Job)
            </Button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
