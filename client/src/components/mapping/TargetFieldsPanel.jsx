import React, { useState, useMemo } from 'react';
import { 
  SearchIcon, 
  DatabaseIcon, 
  XIcon, 
  ArrowRightIcon, 
  GripVerticalIcon, 
  Settings2Icon 
} from '../common/Icons';
import { describeActiveRules } from '../../utils/transformationRules';

export function TargetFieldsPanel({
  targetFields = [],
  activeSchema,
  sourceHeaders = [],
  reverseMappings = {},
  transformations = {},
  onSetMapping,
  onRemoveMappingByTarget,
  onOpenRules
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'required' | 'mapped' | 'unmapped'
  const [dragOverField, setDragOverField] = useState(null);
  const [draggedField, setDraggedField] = useState(null);

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

  // Drag & Drop handlers
  const handleDragStart = (e, fieldName) => {
    setDraggedField(fieldName);
    e.dataTransfer.setData('text/streamweaver-target', fieldName);
    e.dataTransfer.setData('text/plain', fieldName);
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleDragEnd = () => {
    setDraggedField(null);
    setDragOverField(null);
  };

  const handleDragOver = (e, fieldName) => {
    if (e.dataTransfer.types.includes('text/streamweaver-source') || e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDragOverField(fieldName);
    }
  };

  const handleDragLeave = () => {
    setDragOverField(null);
  };

  const handleDrop = (e, fieldName) => {
    e.preventDefault();
    setDragOverField(null);
    const sourceCol = e.dataTransfer.getData('text/streamweaver-source') || e.dataTransfer.getData('text/plain');
    if (sourceCol && sourceHeaders.includes(sourceCol)) {
      onSetMapping(sourceCol, fieldName);
    }
  };

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
        <span className="panel-drag-hint">&larr; Drop source column here</span>
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
        {targetFields.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <DatabaseIcon size={32} className="text-purple" style={{ opacity: 0.6 }} />
            <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>No Target Fields Found</div>
            <p style={{ fontSize: '0.82rem', maxWidth: '300px' }}>
              Select a target database schema from the collection dropdown above.
            </p>
          </div>
        ) : filteredFields.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
            No target fields matching filter {searchQuery ? `"${searchQuery}"` : ''}
          </div>
        ) : (
          filteredFields.map((field) => {
            const mappedSource = reverseMappings[field.name] || '';
            const isRequiredUnmapped = field.required && !mappedSource;
            const isDropActive = dragOverField === field.name;
            const isDragging = draggedField === field.name;

            const rules = mappedSource ? (transformations[mappedSource] || {}) : {};
            const activeRuleTags = describeActiveRules(rules);

            return (
              <div
                key={field.name}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, field.name)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, field.name)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, field.name)}
                className={`target-card ${mappedSource ? 'is-mapped' : ''} ${isRequiredUnmapped ? 'is-required-unmapped' : ''} ${isDropActive ? 'is-drop-active' : ''} ${isDragging ? 'is-dragging' : ''}`}
              >
                <div className="target-card-top">
                  <div className="target-name-group">
                    <span className="drag-handle-grip" title="Drag to connect">
                      <GripVerticalIcon size={15} />
                    </span>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span className="binding-label">
                      <ArrowRightIcon size={13} className="text-purple" />
                      Source:
                    </span>

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
                      <option value="">-- Drop or Select Column --</option>
                      {sourceHeaders.map((src) => (
                        <option key={src} value={src}>
                          {src}
                        </option>
                      ))}
                    </select>

                    {mappedSource && (
                      <button
                        type="button"
                        className="mapping-chip-unlink-btn"
                        onClick={() => onRemoveMappingByTarget(field.name)}
                        title={`Unlink ${field.name}`}
                        aria-label={`Unlink ${field.name}`}
                      >
                        <XIcon size={14} />
                      </button>
                    )}
                  </div>

                  {mappedSource && onOpenRules && (
                    <button
                      type="button"
                      className="rules-pill-btn rules-pill-purple"
                      onClick={() => onOpenRules(mappedSource)}
                      title="Configure transformation rules for this field"
                    >
                      <Settings2Icon size={13} className="text-purple" />
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
