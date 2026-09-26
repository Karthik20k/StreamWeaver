import React, { useState, useMemo } from 'react';
import { SearchIcon, LayersIcon, ArrowRightIcon } from '../common/Icons';
import { inferColumnTypes } from '../../utils/columnAutoSizer';

export function SourceColumnsPanel({
  sourceHeaders = [],
  sampleRows = [],
  mappings = {},
  targetFields = [],
  onSetMapping
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'mapped' | 'unmapped'

  // Infer column types based on sample rows
  const inferredTypes = useMemo(() => {
    return inferColumnTypes(sourceHeaders, sampleRows);
  }, [sourceHeaders, sampleRows]);

  // Extract up to 2 distinct sample values per column from preview rows
  const columnSamples = useMemo(() => {
    const samplesMap = {};
    for (const col of sourceHeaders) {
      const values = [];
      for (const row of sampleRows.slice(0, 10)) {
        const v = row?.[col];
        if (v !== undefined && v !== null && v !== '') {
          const str = String(v);
          if (!values.includes(str)) {
            values.push(str);
            if (values.length >= 2) break;
          }
        }
      }
      samplesMap[col] = values;
    }
    return samplesMap;
  }, [sourceHeaders, sampleRows]);

  // Filter columns based on search and filter tab
  const filteredHeaders = useMemo(() => {
    return sourceHeaders.filter((col) => {
      const isMapped = Boolean(mappings[col]);

      if (filterMode === 'mapped' && !isMapped) return false;
      if (filterMode === 'unmapped' && isMapped) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = col.toLowerCase().includes(q);
        const matchesMapped = mappings[col]?.toLowerCase().includes(q);
        if (!matchesName && !matchesMapped) return false;
      }

      return true;
    });
  }, [sourceHeaders, mappings, filterMode, searchQuery]);

  const mappedCount = Object.keys(mappings).length;
  const unmappedCount = Math.max(0, sourceHeaders.length - mappedCount);

  return (
    <div className="mapping-panel">
      <div className="panel-header-row">
        <div className="panel-title-group">
          <LayersIcon size={18} className="text-cyan" />
          <h3>CSV Source Columns</h3>
          <span className="panel-badge source-badge">{sourceHeaders.length} Detected</span>
        </div>
      </div>

      <div className="panel-filter-bar">
        <div className="panel-search-wrap">
          <SearchIcon size={14} className="panel-search-icon" />
          <input
            type="text"
            placeholder="Search source columns..."
            className="panel-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <button
          className={`filter-tab-pill ${filterMode === 'all' ? 'is-active' : ''}`}
          onClick={() => setFilterMode('all')}
        >
          All ({sourceHeaders.length})
        </button>
        <button
          className={`filter-tab-pill ${filterMode === 'mapped' ? 'is-active' : ''}`}
          onClick={() => setFilterMode('mapped')}
        >
          Mapped ({mappedCount})
        </button>
        <button
          className={`filter-tab-pill ${filterMode === 'unmapped' ? 'is-active' : ''}`}
          onClick={() => setFilterMode('unmapped')}
        >
          Unmapped ({unmappedCount})
        </button>
      </div>

      <div className="mapping-cards-list">
        {filteredHeaders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
            No source columns matching filter
          </div>
        ) : (
          filteredHeaders.map((colName, idx) => {
            const type = inferredTypes[colName] || 'str';
            const mappedTarget = mappings[colName] || '';
            const samples = columnSamples[colName] || [];

            return (
              <div
                key={colName}
                className={`source-card ${mappedTarget ? 'is-mapped' : ''}`}
              >
                <div className="source-card-top">
                  <div className="source-col-name-group">
                    <span className="col-idx-tag">#{idx + 1}</span>
                    <span className="source-col-name" title={colName}>{colName}</span>
                  </div>
                  <span className={`type-tag ${type}`}>{type}</span>
                </div>

                {samples.length > 0 && (
                  <div className="source-samples-preview">
                    {samples.map((s, sIdx) => (
                      <span key={sIdx} className="sample-chip-val" title={`Sample: ${s}`}>
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                <div className="source-card-binding">
                  <span className="binding-label">
                    <ArrowRightIcon size={13} className="text-cyan" />
                    Target Field:
                  </span>

                  <select
                    className={`target-select-inline ${mappedTarget ? 'has-mapping' : ''}`}
                    value={mappedTarget}
                    onChange={(e) => onSetMapping(colName, e.target.value)}
                    aria-label={`Target field for ${colName}`}
                  >
                    <option value="">-- Select Target Field --</option>
                    {targetFields.map((tf) => (
                      <option key={tf.name} value={tf.name}>
                        {tf.name} ({tf.type}){tf.required ? ' *Required' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
