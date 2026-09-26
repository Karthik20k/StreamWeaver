import React from 'react';
import { SlidersIcon, SparklesIcon, TrashIcon, CopyIcon, DatabaseIcon } from '../common/Icons';
import { Button } from '../common/Button';

export function MappingHeader({
  schemas = [],
  selectedSchemaId,
  onSelectSchema,
  onAutoMap,
  onClearMappings,
  onOpenJsonModal,
  mappedCount = 0,
  totalSource = 0
}) {
  return (
    <div className="mapping-toolbar-card">
      <div className="mapping-toolbar-left">
        <div className="mapping-stage-identity">
          <div className="mapping-icon-square">
            <SlidersIcon size={22} className="text-cyan" />
          </div>
          <div className="mapping-title-block">
            <h2>Schema Mapping Interface</h2>
            <p>Bind raw CSV source columns to target MongoDB database fields</p>
          </div>
        </div>

        <div className="schema-selector-group">
          <label htmlFor="target-schema-select">Target Collection:</label>
          <select
            id="target-schema-select"
            className="schema-select-dropdown"
            value={selectedSchemaId}
            onChange={(e) => onSelectSchema(e.target.value)}
          >
            {schemas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.fields.length} fields)
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mapping-toolbar-actions">
        <Button
          variant="outline"
          size="sm"
          icon={CopyIcon}
          onClick={onOpenJsonModal}
          title="Inspect active mapping dictionary JSON"
        >
          View Config JSON
        </Button>

        <Button
          variant="outline"
          size="sm"
          icon={TrashIcon}
          onClick={onClearMappings}
          disabled={mappedCount === 0}
          title="Clear all active column mappings"
        >
          Reset Mappings
        </Button>

        <Button
          variant="secondary"
          size="sm"
          icon={SparklesIcon}
          onClick={onAutoMap}
          title="Auto-match columns by normalized name heuristics"
        >
          Auto-Map Fields
        </Button>
      </div>
    </div>
  );
}
