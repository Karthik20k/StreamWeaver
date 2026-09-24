import React from 'react';
import { LayersIcon, ArrowRightIcon } from '../common/Icons';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { formatBytes } from '../../utils/fileHelpers';

export function PreviewPlaceholder({ file, metadata, onBackToUpload }) {
  return (
    <div className="preview-staged-panel">
      <div className="staged-header">
        <div className="staged-title-group">
          <div className="staged-icon-box">
            <LayersIcon size={26} className="text-purple" />
          </div>
          <div>
            <div className="staged-name-row">
              <h3 className="staged-title">Data Grid Preview</h3>
              <Badge variant="purple" size="sm">Stage 2</Badge>
            </div>
            <p className="staged-desc">
              <strong>{file?.name}</strong> ({formatBytes(file?.size || 0)}) loaded and ready for preview.
            </p>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={onBackToUpload}>
          &larr; Back to Upload
        </Button>
      </div>

      <div className="staged-info-card">
        <div className="staged-grid">
          <div className="staged-stat">
            <span className="stat-num">{metadata?.headers?.length || 0}</span>
            <span className="stat-title">Parsed Columns</span>
          </div>
          <div className="staged-stat">
            <span className="stat-num text-cyan">{metadata?.estimatedRows?.toLocaleString() || 0}</span>
            <span className="stat-title">Estimated Rows</span>
          </div>
          <div className="staged-stat">
            <span className="stat-num text-emerald">{metadata?.detectedDelimiter === '\t' ? 'Tab' : metadata?.detectedDelimiter || ','}</span>
            <span className="stat-title">Delimiter</span>
          </div>
          <div className="staged-stat">
            <span className="stat-num text-purple">{formatBytes(file?.size || 0)}</span>
            <span className="stat-title">File Size</span>
          </div>
        </div>

        <div className="staged-roadmap-alert">
          <div className="roadmap-text">
            Virtual scrolling grid table is being wired up for large row counts. Use the button above to change files or configure parser settings.
          </div>
        </div>
      </div>
    </div>
  );
}
