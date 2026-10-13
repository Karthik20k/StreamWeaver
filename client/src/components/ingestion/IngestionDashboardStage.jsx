import React, { useEffect, useRef, useState } from 'react';
import '../../styles/ingestion.css';

import { useIngestionStream } from '../../hooks/useIngestionStream';
import { useWebSocketTelemetry } from '../../hooks/useWebSocketTelemetry';
import { ErrorAuditDrawer } from './ErrorAuditDrawer';
import { RadialProgressBar } from './RadialProgressBar';
import { SpeedGaugeWidget } from './SpeedGaugeWidget';
import { CountdownClockWidget } from './CountdownClockWidget';
import { TelemetrySpeedChart } from './TelemetrySpeedChart';
import { IngestionControlCenter } from './IngestionControlCenter';
import { TerminalStateBanner } from './TerminalStateBanner';
import { FailedRowsInspector } from './FailedRowsInspector';
import { Button } from '../common/Button';
import { 
  DatabaseIcon, 
  CloudUploadIcon, 
  CheckCircleIcon, 
  AlertCircleIcon, 
  ZapIcon, 
  ActivityIcon,
  CopyIcon,
  CheckIcon,
  XIcon,
  SlidersIcon,
  PauseIcon,
  PlayIcon
} from '../common/Icons';
import { formatBytes } from '../../utils/fileHelpers';

export function IngestionDashboardStage({
  file,
  mappingConfig,
  metadata,
  onBackToMapping,
  onProceedToAudit
}) {
  const [copiedJobId, setCopiedJobId] = useState(false);
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);
  const terminalEndRef = useRef(null);

  const {
    status,
    jobId,
    progress,
    bytesUploaded,
    totalBytes,
    rowsProcessed,
    totalRows,
    processingRate,
    errorCount,
    batchesCommitted,
    recentErrors,
    logs,
    elapsedSeconds,
    etaSeconds,
    uploadSpeedMBps,
    isPaused,
    isProcessing,
    terminalState,
    startIngestion,
    pauseIngestion,
    resumeIngestion,
    abortIngestion,
    resetIngestion
  } = useIngestionStream({
    file,
    mappingConfig,
    metadata
  });

  const [peakRate, setPeakRate] = useState(0);

  // Track maximum observed processing rate
  useEffect(() => {
    if (processingRate > peakRate) {
      setPeakRate(processingRate);
    }
  }, [processingRate, peakRate]);

  // Day 13 & 14: WebSocket Client Integration with automatic reconnection & signal dispatch
  const {
    wsStatus,
    telemetryHistory,
    isLive: isLiveCharting,
    setIsLive: setIsLiveCharting,
    reconnect: reconnectWs,
    sendAbortSignal,
    sendPauseSignal,
    sendResumeSignal
  } = useWebSocketTelemetry({
    jobId,
    enabled: Boolean(jobId),
    fallbackRate: processingRate
  });

  // Day 14: Operator Control Handlers with WebSocket signal dispatch
  const handlePause = () => {
    sendPauseSignal();
    pauseIngestion();
  };

  const handleResume = () => {
    sendResumeSignal();
    resumeIngestion();
  };

  const handleAbort = (reason = 'Manual operator abort') => {
    sendAbortSignal(reason);
    abortIngestion(reason);
  };

  // Automatically start ingestion upon transitioning into this dashboard stage
  useEffect(() => {
    startIngestion();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll terminal log to bottom on new messages
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleCopyJobId = async () => {
    if (!jobId) return;
    try {
      await navigator.clipboard.writeText(jobId);
      setCopiedJobId(true);
      setTimeout(() => setCopiedJobId(false), 2000);
    } catch (err) {
      console.error('Failed to copy Job ID:', err);
    }
  };

  const formatElapsed = (sec) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isCompleted = status === 'completed';
  const isAborted = status === 'aborted';

  // Compute status badge label
  const getStatusBeaconText = () => {
    if (isPaused) return 'EXECUTION PAUSED';
    if (status === 'streaming' || status === 'uploading') return 'STREAMING ACTIVE';
    if (terminalState === 'completed_success') return 'COMPLETED 100%';
    if (terminalState === 'completed_warnings') return 'COMPLETED W/ WARNINGS';
    if (terminalState === 'aborted') return 'STREAM ABORTED';
    return status.toUpperCase();
  };

  return (
    <div className="ingestion-dashboard-stage">
      {/* --------------------------------------------------------------------
          1. Header Toolbar
          -------------------------------------------------------------------- */}
      <div className="ingest-toolbar-card">
        <div className="ingest-identity-block">
          <div className="ingest-icon-square">
            <DatabaseIcon size={24} className="text-emerald" />
          </div>
          <div className="ingest-title-group">
            <h2>Live Ingestion Progress Dashboard</h2>
            <div className="ingest-meta-pills">
              {jobId && (
                <span className="job-id-pill" title="Click to copy Job ID" onClick={handleCopyJobId}>
                  <span>Job ID: {jobId}</span>
                  {copiedJobId ? <CheckIcon size={12} className="text-emerald" /> : <CopyIcon size={12} />}
                </span>
              )}

              <span className={`status-beacon-pill is-${isPaused ? 'paused' : status}`}>
                <span className="beacon-dot" />
                <span>{getStatusBeaconText()}</span>
              </span>

              <span className="panel-badge target-badge">
                Target: {mappingConfig?.targetCollection || 'ecommerce_orders'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Button
            variant="outline"
            size="sm"
            icon={AlertCircleIcon}
            onClick={() => setIsAuditDrawerOpen(true)}
            title="Open Dead Letter Queue Error Audit Drawer"
          >
            Audit DLQ Errors {errorCount > 0 ? `(${errorCount})` : ''}
          </Button>

          {isProcessing && !isPaused && (
            <Button
              variant="outline"
              size="sm"
              icon={PauseIcon}
              onClick={handlePause}
              title="Pause streaming ingestion"
            >
              Pause
            </Button>
          )}

          {isPaused && (
            <Button
              variant="secondary"
              size="sm"
              icon={PlayIcon}
              onClick={handleResume}
              title="Resume streaming ingestion"
            >
              Resume
            </Button>
          )}

          {(isProcessing || isPaused) && (
            <Button
              variant="outline"
              size="sm"
              icon={XIcon}
              onClick={() => handleAbort('Toolbar abort')}
              title="Abort streaming pipeline"
            >
              Abort Stream
            </Button>
          )}

          {(isCompleted || isAborted) && (
            <Button
              variant="secondary"
              size="sm"
              icon={ZapIcon}
              onClick={() => startIngestion()}
              title="Restart streaming ingestion"
            >
              Restart Pipeline
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToMapping}
          >
            &larr; Schema Mapping
          </Button>
        </div>
      </div>

      {/* --------------------------------------------------------------------
          1b. Day 14: Ingestion Control Center & Cancellation Triggers
          Interactive execution controls: Pause Ingestion, Resume, Abort Stream
          Wired to WebSocket termination signal (ABORT_STREAM) to close backend isolate
          -------------------------------------------------------------------- */}
      <IngestionControlCenter
        status={status}
        isPaused={isPaused}
        isProcessing={isProcessing}
        terminalState={terminalState}
        jobId={jobId}
        rowsProcessed={rowsProcessed}
        totalRows={totalRows}
        wsStatus={wsStatus}
        onPause={handlePause}
        onResume={handleResume}
        onAbort={handleAbort}
        onRestart={() => startIngestion()}
      />

      {/* --------------------------------------------------------------------
          2. Day 12: Real-Time Telemetry Dashboard Suite
          Radial/Linear Progress + Dynamic Speed Gauge + Countdown Clock
          -------------------------------------------------------------------- */}
      <div className="telemetry-dashboard-hero-suite">
        {/* Widget 1: Real-Time Radial & Linear Progress Bar (Bytes & Rows) */}
        <RadialProgressBar
          bytesUploaded={bytesUploaded}
          totalBytes={totalBytes || file?.size || 0}
          rowsProcessed={rowsProcessed}
          totalRows={totalRows}
          status={status}
        />

        {/* Widget 2: Dynamic Speed Gauge (Rows Processed / Sec) */}
        <SpeedGaugeWidget
          processingRate={processingRate}
          peakRate={peakRate}
          uploadSpeedMBps={uploadSpeedMBps}
          status={status}
        />

        {/* Widget 3: Running Countdown Clock with Dynamic ETA Calculation */}
        <CountdownClockWidget
          etaSeconds={etaSeconds}
          elapsedSeconds={elapsedSeconds}
          totalRows={totalRows}
          rowsProcessed={rowsProcessed}
          processingRate={processingRate}
          status={status}
        />
      </div>

      {/* Primary Cyber Stream Progress Track */}
      <div className="ingest-progress-stream-bar-card">
        <div className="stream-bar-meta-row">
          <span className="stream-meta-status">
            {isCompleted ? 'Pipeline Ingestion Finalized (100%)' : 'Streaming Chunks Through isolated-vm Sandbox to Database Buffer...'}
          </span>
          <div className="stream-bar-meta-right">
            <span className="stream-meta-throughput text-cyan">
              {uploadSpeedMBps > 0 ? `${uploadSpeedMBps} MB/s` : `${Math.round(processingRate / 1000)}k rows/s`}
            </span>
            <span className="stream-meta-pct">{progress}%</span>
          </div>
        </div>
        <div className="cyber-progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
          <div
            className={`cyber-progress-bar ${isProcessing ? 'is-animated' : ''}`}
            style={{ width: `${Math.max(2, progress)}%` }}
          />
        </div>
      </div>

      {/* --------------------------------------------------------------------
          2b. Day 13: Real-Time WebSocket Telemetry Speed Chart (60 FPS)
          Plots ingestion speed (rows/sec) over time with Recharts
          -------------------------------------------------------------------- */}
      <TelemetrySpeedChart
        telemetryHistory={telemetryHistory}
        wsStatus={wsStatus}
        onReconnect={reconnectWs}
        isLive={isLiveCharting}
        onToggleLive={() => setIsLiveCharting((prev) => !prev)}
      />

      {/* --------------------------------------------------------------------
          3. 4 Real-Time Telemetry KPI Cards
          -------------------------------------------------------------------- */}
      <div className="ingest-kpi-grid">
        {/* KPI 1: Clean Rows Processed Counter */}
        <div className="ingest-kpi-card">
          <div className="ingest-kpi-icon cyan">
            <CloudUploadIcon size={22} />
          </div>
          <div className="ingest-kpi-body">
            <span className="ingest-kpi-title">Clean Records Ingested</span>
            <div className="ingest-kpi-val-row">
              <span className="ingest-kpi-val">{rowsProcessed.toLocaleString()}</span>
              <span className="ingest-kpi-sub">/ ~{(totalRows || 50000).toLocaleString()}</span>
            </div>
            <span className="kpi-sub text-cyan">Verified & Sanitized</span>
          </div>
        </div>

        {/* KPI 2: Real-time Processing Speed */}
        <div className="ingest-kpi-card">
          <div className="ingest-kpi-icon emerald">
            <ZapIcon size={22} />
          </div>
          <div className="ingest-kpi-body">
            <span className="ingest-kpi-title">Processing Velocity</span>
            <div className="ingest-kpi-val-row">
              <span className="ingest-kpi-val">{processingRate.toLocaleString()}</span>
              <span className="ingest-kpi-sub">rows / sec</span>
            </div>
            <span className="kpi-sub text-emerald">High-Throughput V8 Pipe</span>
          </div>
        </div>

        {/* KPI 3: Dynamic Error Counter (DLQ) */}
        <div
          className="ingest-kpi-card"
          onClick={() => setIsAuditDrawerOpen(true)}
          style={{ cursor: 'pointer' }}
          title="Click to open Dead Letter Queue Error Audit Drawer"
          role="button"
          tabIndex={0}
        >
          <div className="ingest-kpi-icon amber">
            <AlertCircleIcon size={22} />
          </div>
          <div className="ingest-kpi-body">
            <span className="ingest-kpi-title">Isolated DLQ Errors</span>
            <div className="ingest-kpi-val-row">
              <span className="ingest-kpi-val" style={{ color: errorCount > 0 ? 'var(--accent-amber)' : 'var(--text-main)' }}>
                {errorCount}
              </span>
              <span className="ingest-kpi-sub">bad rows</span>
            </div>
            <span className="kpi-sub" style={{ color: errorCount > 0 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
              {errorCount > 0 ? 'Click to Audit DLQ Records' : '0 validation failures'}
            </span>
          </div>
        </div>

        {/* KPI 4: MongoDB Micro-Batch Buffer */}
        <div className="ingest-kpi-card">
          <div className="ingest-kpi-icon purple">
            <DatabaseIcon size={22} />
          </div>
          <div className="ingest-kpi-body">
            <span className="ingest-kpi-title">Database Buffer Flushes</span>
            <div className="ingest-kpi-val-row">
              <span className="ingest-kpi-val">{batchesCommitted}</span>
              <span className="ingest-kpi-sub">micro-batches</span>
            </div>
            <span className="kpi-sub text-purple">1,000 records / bulkWrite</span>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------------
          4. Split Terminal Logs & Live DLQ Error Feed
          -------------------------------------------------------------------- */}
      <div className="ingest-split-workspace">
        {/* Left: Terminal Console Log */}
        <div className="ingest-terminal-card">
          <div className="terminal-header">
            <div className="terminal-dots">
              <span className="terminal-dot red" />
              <span className="terminal-dot yellow" />
              <span className="terminal-dot green" />
            </div>
            <div className="terminal-title">
              <ActivityIcon size={14} className="text-cyan" />
              <span>LIVE PIPELINE TELEMETRY FEED (SSE)</span>
            </div>
            <span className="panel-badge source-badge">{logs.length} events</span>
          </div>

          <div className="terminal-logs-body">
            {logs.map((log, idx) => {
              const isHighlight = log.includes('✅') || log.includes('✨') || log.includes('committed');
              const isWarn = log.includes('⚠️') || log.includes('DLQ');
              return (
                <div
                  key={idx}
                  className={`terminal-log-line ${isHighlight ? 'is-highlight' : ''} ${isWarn ? 'is-warn' : ''}`}
                >
                  {log}
                </div>
              );
            })}
            <div ref={terminalEndRef} />
          </div>
        </div>

        {/* Right: Live DLQ Error Feed */}
        <div className="ingest-dlq-card">
          <div
            className="dlq-header"
            onClick={() => setIsAuditDrawerOpen(true)}
            style={{ cursor: 'pointer' }}
            title="Click to open Dead Letter Queue Error Audit Drawer"
          >
            <div className="dlq-header-title">
              <AlertCircleIcon size={16} className="text-amber" />
              <span>DEAD LETTER QUEUE (DLQ) FEED</span>
            </div>
            <span className="panel-badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)' }}>
              {errorCount} Isolated &rarr;
            </span>
          </div>

          <div className="dlq-feed-body">
            {recentErrors.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
                <CheckCircleIcon size={24} className="text-emerald" style={{ margin: '0 auto 0.5rem auto' }} />
                <p>No validation errors intercepted yet.</p>
                <span style={{ fontSize: '0.74rem' }}>Stream is executing with zero data anomalies.</span>
              </div>
            ) : (
              recentErrors.map((err, idx) => (
                <div
                  key={idx}
                  className="dlq-item-card"
                  onClick={() => setIsAuditDrawerOpen(true)}
                  style={{ cursor: 'pointer' }}
                  title="Click to inspect this row in Error Audit Drawer"
                >
                  <div className="dlq-item-top">
                    <span className="dlq-row-tag">Row #{err.rowNumber}</span>
                    <span className="dlq-field-pill">{err.failedField}</span>
                  </div>
                  <p className="dlq-reason-text">{err.rejectedReason}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------------
          4b. Day 15: Error Inspection & Failed-Record Highlight View
          Dedicated Failed Rows Inspector beneath the progress dashboard with
          red column highlighting, inline exception debugger & streaming CSV export
          -------------------------------------------------------------------- */}
      <FailedRowsInspector
        jobId={jobId}
        liveErrors={recentErrors}
        className="dashboard-failed-rows-inspector"
      />

      {/* --------------------------------------------------------------------
          5. Day 14: Terminal States Display
          Completed with Success, Completed with Warnings, or Aborted
          -------------------------------------------------------------------- */}
      <TerminalStateBanner
        terminalState={terminalState}
        rowsProcessed={rowsProcessed}
        totalRows={totalRows}
        errorCount={errorCount}
        targetCollection={mappingConfig?.targetCollection || 'ecommerce_orders'}
        elapsedSeconds={elapsedSeconds}
        processingRate={processingRate}
        onAuditErrors={() => setIsAuditDrawerOpen(true)}
        onRestart={() => startIngestion()}
        onBackToMapping={onBackToMapping}
        onProceedToAudit={() => {
          setIsAuditDrawerOpen(true);
          if (onProceedToAudit) onProceedToAudit(jobId);
        }}
      />

      {/* --------------------------------------------------------------------
          6. Dead Letter Queue (DLQ) Error Audit Drawer (Day 5)
          -------------------------------------------------------------------- */}
      <ErrorAuditDrawer
        isOpen={isAuditDrawerOpen}
        onClose={() => setIsAuditDrawerOpen(false)}
        jobId={jobId}
        targetCollection={mappingConfig?.targetCollection || 'ecommerce_orders'}
        totalProcessed={rowsProcessed}
        isStreamActive={isProcessing}
        streamStatus={status}
      />
    </div>
  );
}
