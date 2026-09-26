import React, { useState } from 'react';
import { CloudUploadIcon, CheckCircleIcon, AlertCircleIcon, XIcon, ZapIcon } from '../common/Icons';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { formatBytes } from '../../utils/fileHelpers';

export function UploadProgressModal({
  isOpen,
  onClose,
  file,
  uploadState,
  mappingConfig = null
}) {
  const [useSimulation, setUseSimulation] = useState(false);

  if (!isOpen) return null;

  const {
    status,
    progress,
    bytesUploaded,
    totalBytes,
    uploadSpeedMBps,
    etaSeconds,
    error,
    serverResponse,
    startUpload,
    abortUpload,
    resetUpload
  } = uploadState;

  const isUploading = status === 'uploading';
  const isCompleted = status === 'completed';
  const isError = status === 'error';
  const isAborted = status === 'aborted';

  const handleStart = () => {
    startUpload(file, useSimulation, {
      mappingConfig: mappingConfig ? JSON.stringify(mappingConfig) : '{}'
    });
  };

  const handleClose = () => {
    if (isUploading) {
      if (window.confirm('An upload is in progress. Do you want to cancel and close?')) {
        abortUpload();
        onClose();
      }
    } else {
      resetUpload();
      onClose();
    }
  };

  return (
    <div className="modal-backdrop-overlay" onClick={handleClose} role="dialog" aria-modal="true">
      <div className="modal-dialog-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-bar">
          <div className="modal-header-title">
            <CloudUploadIcon size={20} className="text-cyan" />
            <h3 className="modal-title-text">Stream to Backend</h3>
            <Badge variant="purple" size="sm">HTTP Stream</Badge>
            {mappingConfig && (
              <Badge variant="emerald" size="sm">
                {Object.keys(mappingConfig.mappingRules || {}).length} Mapped
              </Badge>
            )}
          </div>
          <button className="modal-close-btn" onClick={handleClose} aria-label="Close modal">
            <XIcon size={18} />
          </button>
        </div>

        <div className="modal-body-content">
          <div className="file-identity">
            <div>
              <div className="file-name-text">{file?.name}</div>
              <div className="file-sub-info">
                <span>{formatBytes(file?.size || 0)}</span>
                <span>&bull;</span>
                <span className="font-mono">POST /api/upload/stream</span>
              </div>
            </div>
          </div>

          {status === 'idle' && (
            <>
              <div className="dev1-integration-note">
                Streams raw file chunks directly to the backend endpoint using multipart upload without buffering the full payload in memory.
              </div>

              <div className="flex items-center gap-2 p-3 bg-elevated rounded-lg border border-subtle">
                <input
                  type="checkbox"
                  id="sim-mode-chk"
                  checked={useSimulation}
                  onChange={(e) => setUseSimulation(e.target.checked)}
                  className="rounded text-cyan"
                />
                <label htmlFor="sim-mode-chk" className="text-sm text-secondary cursor-pointer">
                  Simulate stream (for offline testing)
                </label>
              </div>
            </>
          )}

          {(isUploading || isCompleted || isAborted || isError) && (
            <div className="upload-stats-display">
              <div className="flex items-center justify-between text-sm">
                <span className="text-secondary font-medium">
                  {isUploading && 'Streaming Chunks to Server...'}
                  {isCompleted && 'Stream Completed!'}
                  {isAborted && 'Upload Cancelled'}
                  {isError && 'Upload Failed'}
                </span>
                <span className="font-mono text-cyan font-bold">{progress}%</span>
              </div>

              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${progress}%`,
                    background: isCompleted ? '#10b981' : isError || isAborted ? '#ef4444' : undefined
                  }}
                />
              </div>

              <div className="upload-live-metrics">
                <div>
                  <span className="font-mono text-main">{formatBytes(bytesUploaded)}</span>
                  <span className="text-muted"> / {formatBytes(totalBytes || file?.size || 0)}</span>
                </div>

                {isUploading && (
                  <div className="flex items-center gap-3">
                    <span className="upload-throughput-tag">{uploadSpeedMBps} MB/s</span>
                    <span className="text-muted text-xs">ETA: {etaSeconds}s</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {isCompleted && (
            <div className="benchmark-badge-row passed">
              <div className="flex items-center gap-2">
                <CheckCircleIcon size={22} className="text-emerald" />
                <div>
                  <strong className="text-emerald">Upload Complete</strong>
                  <div className="text-xs text-muted">
                    {serverResponse?.mode === 'simulated_stream' ? 'Simulated stream completed successfully.' : 'File stream received and written to disk.'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {isError && (
            <div className="benchmark-badge-row failed">
              <div className="flex items-center gap-2">
                <AlertCircleIcon size={22} className="text-red" />
                <div className="text-xs text-red">
                  {error}
                </div>
              </div>
            </div>
          )}

          {isAborted && (
            <div className="benchmark-badge-row failed">
              <div className="flex items-center gap-2">
                <AlertCircleIcon size={22} className="text-amber" />
                <div className="text-xs text-secondary">
                  Stream stopped. Partial files on disk are cleaned up automatically.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer-actions">
          {isUploading ? (
            <Button variant="danger" size="md" onClick={abortUpload}>
              Cancel Stream
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="md" onClick={handleClose}>
                {isCompleted ? 'Done' : 'Close'}
              </Button>
              <Button
                variant="primary"
                size="md"
                icon={isCompleted ? ZapIcon : CloudUploadIcon}
                onClick={handleStart}
              >
                {isCompleted ? 'Stream Again' : 'Start Upload'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
