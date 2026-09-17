import React, { useRef } from 'react';
import { CloudUploadIcon, AlertCircleIcon, FileSpreadsheetIcon, SparklesIcon } from '../common/Icons';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';

export function FileDropzone({
  isDragging,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
  error,
  isAnalyzing,
  acceptedExtensions = ['.csv', '.tsv', '.json', '.jsonl']
}) {
  const fileInputRef = useRef(null);

  const handleBrowseClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  return (
    <div className="dropzone-wrapper">
      <div
        className={`dropzone-container ${isDragging ? 'is-dragging' : ''} ${error ? 'has-error' : ''}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={handleBrowseClick}
        role="region"
        aria-label="Drag and Drop File Upload Area"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedExtensions.join(',')}
          onChange={onFileSelect}
          className="dropzone-hidden-input"
          aria-hidden="true"
        />

        <div className="dropzone-glow-effect" />

        <div className="dropzone-content">
          <div className={`dropzone-icon-bubble ${isDragging ? 'pulse-fast' : ''}`}>
            {isDragging ? (
              <SparklesIcon size={36} className="text-cyan animate-spin-slow" />
            ) : (
              <CloudUploadIcon size={38} className="text-cyan" />
            )}
          </div>

          <div className="dropzone-text-group">
            <h3 className="dropzone-title">
              {isDragging ? 'Release to Intake File' : 'Drop dataset file here or click to browse'}
            </h3>
            <p className="dropzone-subtitle">
              Native stream chunking engine &bull; High-throughput RAM-safe ingestion for files up to 5GB+
            </p>
          </div>

          <div className="format-tags-row">
            <span className="format-label">Supported Schemas:</span>
            {acceptedExtensions.map(ext => (
              <Badge key={ext} variant="dark" size="sm">
                {ext.toUpperCase().replace('.', '')}
              </Badge>
            ))}
          </div>

          <div className="dropzone-button-row" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="primary"
              size="md"
              icon={FileSpreadsheetIcon}
              onClick={handleBrowseClick}
            >
              Select File from Disk
            </Button>
          </div>

          {isAnalyzing && (
            <div className="dropzone-analyzing-bar">
              <span className="analyzing-spinner" />
              <span>Analyzing file slice and detecting schema...</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="dropzone-error-banner" role="alert">
          <AlertCircleIcon size={18} className="text-red" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
