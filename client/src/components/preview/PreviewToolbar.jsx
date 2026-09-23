import React from 'react';
import { 
  FileSpreadsheetIcon, 
  SearchIcon, 
  ZapIcon, 
  CloudUploadIcon, 
  ActivityIcon 
} from '../common/Icons';
import { Button } from '../common/Button';
import { formatBytes } from '../../utils/fileHelpers';
import { useFPSMonitor } from '../../hooks/useFPSMonitor';

export function PreviewToolbar({
  file,
  metadata,
  totalPreviewRows,
  searchQuery,
  onSearchChange,
  onOpenBenchmark,
  onOpenUpload,
  onBackToUpload
}) {
  const fps = useFPSMonitor();

  const delimiterName = metadata?.detectedDelimiter === '\t' 
    ? 'Tab' 
    : metadata?.detectedDelimiter === ';'
    ? 'Semicolon'
    : metadata?.detectedDelimiter === '|'
    ? 'Pipe'
    : metadata?.detectedDelimiter || 'Comma';

  return (
    <div className="preview-toolbar-card">
      <div className="toolbar-left-group">
        <div className="file-identity">
          <div className="file-icon-square">
            <FileSpreadsheetIcon size={22} className="text-cyan" />
          </div>
          <div>
            <div className="file-name-text">{file?.name || 'Dataset Preview'}</div>
            <div className="file-sub-info">
              <span>{formatBytes(file?.size || 0)}</span>
              <span>&bull;</span>
              <span>{delimiterName} Delimited</span>
            </div>
          </div>
        </div>

        <div className="toolbar-badges-row">
          <div className="telemetry-pill">
            <span>Sample:</span>
            <span className="pill-val text-cyan">{totalPreviewRows.toLocaleString()} rows</span>
          </div>

          <div className="telemetry-pill">
            <span>Fields:</span>
            <span className="pill-val text-purple">{metadata?.headers?.length || 0} cols</span>
          </div>

          <div className="telemetry-pill">
            <span>Est. File:</span>
            <span className="pill-val text-emerald">
              {metadata?.estimatedRows ? metadata.estimatedRows.toLocaleString() : 'Estimating...'}
            </span>
          </div>

          <div className="telemetry-pill pill-speed">
            <ZapIcon size={13} className="text-cyan" />
            <span>Worker:</span>
            <span className="pill-val">{metadata?.parseDurationMs ?? 95}ms</span>
          </div>

          <div className="telemetry-pill pill-fps">
            <ActivityIcon size={13} className="text-emerald" />
            <span>Render:</span>
            <span className="pill-val">{fps} FPS</span>
          </div>
        </div>
      </div>

      <div className="toolbar-right-group">
        <div className="search-box-wrap">
          <SearchIcon size={16} className="search-icon-inside" />
          <input
            type="text"
            placeholder="Filter rows..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="search-input"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          icon={ZapIcon}
          onClick={onOpenBenchmark}
          title="Run 2GB benchmark test"
        >
          2GB Benchmark
        </Button>

        <Button
          variant="primary"
          size="sm"
          icon={CloudUploadIcon}
          onClick={onOpenUpload}
        >
          Stream to Backend
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onBackToUpload}
        >
          &larr; Upload
        </Button>
      </div>
    </div>
  );
}
