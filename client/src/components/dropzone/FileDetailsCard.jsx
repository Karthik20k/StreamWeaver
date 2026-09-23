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
                Loaded
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

      <div className="file-metrics-grid">
        <div className="metric-box">
          <span className="metric-label">Estimated Chunks</span>
          <div className="metric-value-row">
            <span className="metric-value">{chunksCount.toLocaleString()}</span>
            <span className="metric-unit">chunks</span>
          </div>
          <span className="metric-subtext">64KB stream buffer</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Delimiter</span>
          <div className="metric-value-row">
            <span className="metric-value font-mono">
              {metadata.detectedDelimiter === '\t' ? '\\t (Tab)' : `"${metadata.detectedDelimiter}"`}
            </span>
          </div>
          <span className="metric-subtext">Detected</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Estimated Total</span>
          <div className="metric-value-row">
            <span className="metric-value text-cyan">
              {metadata.estimatedRows ? metadata.estimatedRows.toLocaleString() : 'Estimating...'}
            </span>
            <span className="metric-unit">rows</span>
          </div>
          <span className="metric-subtext">Approx. in full file</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Columns</span>
          <div className="metric-value-row">
            <span className="metric-value text-purple">
              {metadata.headers ? metadata.headers.length : 0}
            </span>
            <span className="metric-unit">fields</span>
          </div>
          <span className="metric-subtext">From header row</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Worker Parse Speed</span>
          <div className="metric-value-row">
            <span className="metric-value text-emerald">
              {metadata.parseDurationMs !== undefined ? `${metadata.parseDurationMs}` : '< 150'}
            </span>
            <span className="metric-unit">ms</span>
          </div>
          <span className="metric-subtext">{metadata.rowsCount || 1000} preview rows (1MB slice)</span>
        </div>
      </div>

      {metadata.headers && metadata.headers.length > 0 && (
        <div className="headers-preview-section">
          <span className="section-label">Source Columns:</span>
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

      {metadata.snippet && (
        <div className="snippet-preview-section">
          <div className="snippet-header">
            <span className="section-label">First 5 Rows Preview:</span>
            <span className="slice-tag">Sample preview</span>
          </div>
          <pre className="snippet-code-block">
            <code>{metadata.snippet}</code>
          </pre>
        </div>
      )}

      <div className="file-details-footer">
        <div className="footer-left-info">
          <ZapIcon size={16} className="text-cyan" />
          <span>Dataset ready for table preview</span>
        </div>

        <div className="footer-actions">
          <Button
            variant="outline"
            size="md"
            onClick={onReset}
          >
            Change File
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={ArrowRightIcon}
            onClick={onProceed}
          >
            Continue to Preview
          </Button>
        </div>
      </div>
    </div>
  );
}
