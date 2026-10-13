import React, { useState, useMemo } from 'react';
import { 
  SearchIcon, 
  LayersIcon, 
  ArrowRightIcon, 
  GripVerticalIcon, 
  Settings2Icon 
} from '../common/Icons';
import { inferColumnTypes } from '../../utils/columnAutoSizer';
import { describeActiveRules } from '../../utils/transformationRules';

export function SourceColumnsPanel({
  sourceHeaders = [],
  sampleRows = [],
  mappings = {},
  transformations = {},
  targetFields = [],
  onSetMapping,
  onOpenRules
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'mapped' | 'unmapped'
  const [draggedCol, setDraggedCol] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

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

  // Drag event handlers
  const handleDragStart = (e, colName) => {
    setDraggedCol(colName);
    e.dataTransfer.setData('text/streamweaver-source', colName);
    e.dataTransfer.setData('text/plain', colName);
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleDragEnd = () => {
    setDraggedCol(null);
    setDragOverCol(null);
  };

  const handleDragOver = (e, colName) => {
    if (e.dataTransfer.types.includes('text/streamweaver-target')) {
      e.preventDefault();
      setDragOverCol(colName);
    }
  };

  const handleDragLeave = () => {
    setDragOverCol(null);
  };

  const handleDrop = (e, colName) => {
    e.preventDefault();
    setDragOverCol(null);
    const targetFieldName = e.dataTransfer.getData('text/streamweaver-target');
    if (targetFieldName) {
      onSetMapping(colName, targetFieldName);
    }
  };

  return (
    <div className="mapping-panel">
      <div className="panel-header-row">
        <div className="panel-title-group">
          <LayersIcon size={18} className="text-cyan" />
          <h3>CSV Source Columns</h3>
          <span className="panel-badge source-badge">{sourceHeaders.length} Detected</span>
        </div>
        <span className="panel-drag-hint">Drag column to target field &rarr;</span>
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
        {sourceHeaders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <LayersIcon size={32} className="text-cyan" style={{ opacity: 0.6 }} />
            <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>No CSV Headers Detected</div>
            <p style={{ fontSize: '0.82rem', maxWidth: '300px' }}>
              Upload a CSV file or select a sample dataset from Step 1 to extract columns for mapping.
            </p>
          </div>
        ) : filteredHeaders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
            No source columns matching filter {searchQuery ? `"${searchQuery}"` : ''}
          </div>
        ) : (
          filteredHeaders.map((colName, idx) => {
            const type = inferredTypes[colName] || 'str';
            const mappedTarget = mappings[colName] || '';
            const samples = columnSamples[colName] || [];
            const isDragging = draggedCol === colName;
            const isDropActive = dragOverCol === colName;

            const rules = transformations[colName] || {};
            const activeRuleTags = describeActiveRules(rules);

            return (
              <div
                key={colName}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, colName)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, colName)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, colName)}
                className={`source-card ${mappedTarget ? 'is-mapped' : ''} ${isDragging ? 'is-dragging' : ''} ${isDropActive ? 'is-drop-active' : ''}`}
              >
                <div className="source-card-top">
                  <div className="source-col-name-group">
                    <span className="drag-handle-grip" title="Drag to map to a target field">
                      <GripVerticalIcon size={15} />
                    </span>
                    <span className="col-idx-tag">#{idx + 1}</span>
                    <span className="source-col-name" title={colName}>{colName}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className={`type-tag ${type}`}>{type}</span>
                  </div>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span className="binding-label">
                      <ArrowRightIcon size={13} className="text-cyan" />
                      Target:
                    </span>

                    <select
                      className={`target-select-inline ${mappedTarget ? 'has-mapping' : ''}`}
                      value={mappedTarget}
                      onChange={(e) => onSetMapping(colName, e.target.value)}
                      aria-label={`Target field for ${colName}`}
                    >
                      <option value="">-- Drop or Select Field --</option>
                      {targetFields.map((tf) => (
                        <option key={tf.name} value={tf.name}>
                          {tf.name} ({tf.type}){tf.required ? ' *Required' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {mappedTarget && onOpenRules && (
                    <button
                      type="button"
                      className="rules-pill-btn"
                      onClick={() => onOpenRules(colName)}
                      title="Configure transformation & sanitization rules"
                    >
                      <Settings2Icon size={13} className="text-cyan" />
                      <span>{activeRuleTags.slice(0, 2).join(' · ') || 'Rules'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
