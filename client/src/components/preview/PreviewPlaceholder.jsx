import React from 'react';
import { LayersIcon, ArrowRightIcon, CheckCircleIcon, SparklesIcon } from '../common/Icons';
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
              <h3 className="staged-title">Virtualized Tabular Preview Ready</h3>
              <Badge variant="purple" size="sm">Day 02 Deliverable</Badge>
            </div>
            <p className="staged-desc">
              File <strong>{file?.name}</strong> ({formatBytes(file?.size || 0)}) successfully staged for <code>react-window</code> DOM virtualization.
            </p>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={onBackToUpload}>
          &larr; Back to File Ingestion
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
            <span className="stat-num text-emerald">60 FPS</span>
            <span className="stat-title">Target Scroll Rate</span>
          </div>
          <div className="staged-stat">
            <span className="stat-num text-purple">&lt;150MB</span>
            <span className="stat-title">RAM Budget</span>
          </div>
        </div>

        <div className="staged-roadmap-alert">
          <SparklesIcon size={20} className="text-cyan flex-shrink-0" />
          <div className="roadmap-text">
            <strong>Day 01 Complete:</strong> File intake and drag-and-drop ingestion successfully staged.
            Next step (<strong>Day 02</strong>): Integrate <code>react-window</code> to render the virtualized data container grid with zero browser lag.
          </div>
        </div>
      </div>
    </div>
  );
}
