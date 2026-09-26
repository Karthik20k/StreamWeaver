import React, { useState, useMemo } from 'react';
import { SearchIcon, DatabaseIcon, XIcon, ArrowRightIcon } from '../common/Icons';

export function TargetFieldsPanel({
  targetFields = [],
  activeSchema,
  sourceHeaders = [],
  reverseMappings = {},
  onSetMapping,
  onRemoveMappingByTarget
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'required' | 'mapped' | 'unmapped'

  const filteredFields = useMemo(() => {
    return targetFields.filter((field) => {
      const isMapped = Boolean(reverseMappings[field.name]);

      if (filterMode === 'required' && !field.required) return false;
      if (filterMode === 'mapped' && !isMapped) return false;
      if (filterMode === 'unmapped' && isMapped) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = field.name.toLowerCase().includes(q);
        const matchesLabel = field.label?.toLowerCase().includes(q);
        const matchesMapped = reverseMappings[field.name]?.toLowerCase().includes(q);
        if (!matchesName && !matchesLabel && !matchesMapped) return false;
      }

      return true;
    });
  }, [targetFields, reverseMappings, filterMode, searchQuery]);

  const requiredCount = targetFields.filter((f) => f.required).length;
  const mappedCount = Object.keys(reverseMappings).length;
  const unmappedCount = Math.max(0, targetFields.length - mappedCount);

  return (
    <div className="mapping-panel">
      <div className="panel-header-row">
        <div className="panel-title-group">
          <DatabaseIcon size={18} className="text-purple" />
          <h3>Target Database Fields</h3>
          <span className="panel-badge target-badge">
            {activeSchema?.targetCollection || 'target_collection'}
          </span>
        </div>
      </div>

      <div className="panel-filter-bar">
        <div className="panel-search-wrap">
          <SearchIcon size={14} className="panel-search-icon" />
          <input
            type="text"
            placeholder="Search target fields..."
            className="panel-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <button
          className={`filter-tab-pill ${filterMode === 'all' ? 'is-active' : ''}`}
          onClick={() => setFilterMode('all')}
        >
          All ({targetFields.length})
        </button>
        <button
          className={`filter-tab-pill ${filterMode === 'required' ? 'is-active' : ''}`}
          onClick={() => setFilterMode('required')}
        >
          Required ({requiredCount})
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
        {filteredFields.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
            No target fields matching filter
          </div>
        ) : (
          filteredFields.map((field) => {
            const mappedSource = reverseMappings[field.name] || '';
            const isRequiredUnmapped = field.required && !mappedSource;

            return (
              <div
                key={field.name}
                className={`target-card ${mappedSource ? 'is-mapped' : ''} ${isRequiredUnmapped ? 'is-required-unmapped' : ''}`}
              >
                <div className="target-card-top">
                  <div className="target-name-group">
                    <span className="target-field-name">{field.name}</span>
                    {field.required && <span className="required-badge">* Required</span>}
                    {field.unique && <span className="unique-badge">Unique</span>}
                  </div>
                  <span className={`type-tag ${field.type}`}>{field.type}</span>
                </div>

                {field.description && (
                  <p className="target-desc-text">
                    {field.description}
                    {field.sampleFormat && (
                      <span style={{ marginLeft: '0.4rem', color: 'var(--accent-cyan)' }}>
                        (e.g., {field.sampleFormat})
                      </span>
                    )}
                  </p>
                )}

                <div className="target-card-binding">
                  <span className="binding-label">
                    <ArrowRightIcon size={13} className="text-purple" />
                    Source Column:
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <select
                      className={`source-select-inline ${mappedSource ? 'has-mapping' : ''}`}
                      value={mappedSource}
                      onChange={(e) => {
                        const newSource = e.target.value;
                        if (newSource) {
                          onSetMapping(newSource, field.name);
                        } else {
                          onRemoveMappingByTarget(field.name);
                        }
                      }}
                      aria-label={`Source column for ${field.name}`}
                    >
                      <option value="">-- Select Source Column --</option>
                      {sourceHeaders.map((src) => (
                        <option key={src} value={src}>
                          {src}
                        </option>
                      ))}
                    </select>

                    {mappedSource && (
                      <button
                        className="mapping-chip-unlink-btn"
                        onClick={() => onRemoveMappingByTarget(field.name)}
                        title={`Unlink ${field.name}`}
                        aria-label={`Unlink ${field.name}`}
                      >
                        <XIcon size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
