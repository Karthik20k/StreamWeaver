import React from 'react';
import { SlidersIcon } from '../common/Icons';

export function UploadConfig({
  config,
  onChange
}) {
  return (
    <div className="upload-config-panel">
      <div className="config-header">
        <SlidersIcon size={16} className="text-cyan" />
        <h4 className="config-heading">Parser & Stream Intake Configuration</h4>
      </div>

      <div className="config-grid">
        <div className="config-item">
          <label className="config-label" htmlFor="delimiter-select">
            Delimiter Override
          </label>
          <select
            id="delimiter-select"
            className="config-select"
            value={config.delimiter}
            onChange={(e) => onChange({ ...config, delimiter: e.target.value })}
          >
            <option value="auto">Auto-Detect (Recommended)</option>
            <option value=",">Comma (,)</option>
            <option value=";">Semicolon (;)</option>
            <option value="&#9;">Tab (\t)</option>
            <option value="|">Pipe (|)</option>
          </select>
        </div>

        <div className="config-item">
          <label className="config-label" htmlFor="encoding-select">
            File Encoding
          </label>
          <select
            id="encoding-select"
            className="config-select"
            value={config.encoding}
            onChange={(e) => onChange({ ...config, encoding: e.target.value })}
          >
            <option value="utf-8">UTF-8 (Standard)</option>
            <option value="ascii">ASCII</option>
            <option value="iso-8859-1">ISO-8859-1 (Latin-1)</option>
          </select>
        </div>

        <div className="config-item">
          <label className="config-label" htmlFor="chunk-size-select">
            Stream Chunk Buffer
          </label>
          <select
            id="chunk-size-select"
            className="config-select"
            value={config.chunkSize}
            onChange={(e) => onChange({ ...config, chunkSize: Number(e.target.value) })}
          >
            <option value={65536}>64 KB (Balanced High-Throughput)</option>
            <option value={32768}>32 KB (Ultra-Low RAM Bounded)</option>
            <option value={131072}>128 KB (High-Bandwidth Network)</option>
          </select>
        </div>

        <div className="config-checkbox-item">
          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={config.hasHeader}
              onChange={(e) => onChange({ ...config, hasHeader: e.target.checked })}
            />
            <span className="checkbox-custom" />
            <span className="checkbox-label">First row contains column headers</span>
          </label>
        </div>
      </div>
    </div>
  );
}
