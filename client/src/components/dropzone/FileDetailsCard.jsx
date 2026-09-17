import React from 'react';
import { FileSpreadsheetIcon, CheckCircleIcon, TrashIcon, ArrowRightIcon, ZapIcon } from '../common/Icons';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { formatBytes, estimateChunks } from '../../utils/fileHelpers';

export function FileDetailsCard({
  file,
  metadata,
  onReset,
  onProceed
}) {
  if (!file || !metadata) return null;

  const chunksCount = estimateChunks(file.size);
  const formattedDate = new Date(file.lastModified).toLocaleString();

  return (
    <div className="file-details-card">
      <div className="card-top-bar">
        <div className="file-meta-header">
          <div className="file-icon-box">
            <FileSpreadsheetIcon size={28} className="text-emerald" />
          </div>
          <div>
            <div className="file-title-row">
              <h3 className="file-name">{file.name}</h3>
              <Badge variant="emerald" size="sm">
                <CheckCircleIcon size={12} className="mr-1" />
                Verified Dataset
              </Badge>
            </div>
            <div className="file-subtitle-specs">
              <span>{formatBytes(file.size)}</span>
              <span className="spec-dot">&bull;</span>
              <span>{file.type || 'text/csv'}</span>
              <span className="spec-dot">&bull;</span>
              <span>Modified: {formattedDate}</span>
            </div>
          </div>
        </div>

        <div className="card-top-actions">
          <Button
            variant="ghost"
            size="sm"
            icon={TrashIcon}
            onClick={onReset}
            title="Remove selected file"
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="file-metrics-grid">
        <div className="metric-box">
          <span className="metric-label">Estimated Chunks</span>
          <div className="metric-value-row">
            <span className="metric-value">{chunksCount.toLocaleString()}</span>
            <span className="metric-unit">@ 64KB</span>
          </div>
          <span className="metric-subtext">Stream chunking bound</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Detected Delimiter</span>
          <div className="metric-value-row">
            <span className="metric-value font-mono">
              {metadata.detectedDelimiter === '\t' ? '\\t (Tab)' : `"${metadata.detectedDelimiter}"`}
            </span>
          </div>
          <span className="metric-subtext">Auto-detected syntax</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Estimated Records</span>
          <div className="metric-value-row">
            <span className="metric-value text-cyan">
              {metadata.estimatedRows ? metadata.estimatedRows.toLocaleString() : 'Estimating...'}
            </span>
            <span className="metric-unit">Rows</span>
          </div>
          <span className="metric-subtext">Memory-safe slice calc</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Detected Fields</span>
          <div className="metric-value-row">
            <span className="metric-value text-purple">
              {metadata.headers ? metadata.headers.length : 0}
            </span>
            <span className="metric-unit">Columns</span>
          </div>
          <span className="metric-subtext">First row headers</span>
        </div>
      </div>

      {/* Headers preview pill list */}
      {metadata.headers && metadata.headers.length > 0 && (
        <div className="headers-preview-section">
          <span className="section-label">Source Schema Fields:</span>
          <div className="headers-pill-wrap">
            {metadata.headers.map((hdr, i) => (
              <span key={i} className="header-pill">
                <span className="header-idx">{i + 1}</span>
                <span className="header-name">{hdr}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Memory-Safe Raw Sample Snippet */}
      {metadata.snippet && (
        <div className="snippet-preview-section">
          <div className="snippet-header">
            <span className="section-label">First 5 Sample Records (Non-blocking Slice Preview):</span>
            <span className="slice-tag">RAM-safe slice (&lt;8KB)</span>
          </div>
          <pre className="snippet-code-block">
            <code>{metadata.snippet}</code>
          </pre>
        </div>
      )}

      {/* Footer Action Bar */}
      <div className="file-details-footer">
        <div className="footer-left-info">
          <ZapIcon size={16} className="text-cyan" />
          <span>File staged for virtualized grid rendering (Day 02)</span>
        </div>

        <div className="footer-actions">
          <Button
            variant="outline"
            size="md"
            onClick={onReset}
          >
            Change Dataset
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={ArrowRightIcon}
            onClick={onProceed}
          >
            Proceed to Virtualized Preview (Day 02)
          </Button>
        </div>
      </div>
    </div>
  );
}
