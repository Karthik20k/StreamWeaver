import React, { useState, useEffect, useMemo } from 'react';
import { 
  XIcon, 
  SlidersIcon, 
  CheckIcon, 
  SparklesIcon, 
  AlertCircleIcon, 
  ArrowRightIcon, 
  TrashIcon 
} from '../common/Icons';
import { Button } from '../common/Button';
import { 
  CASING_OPTIONS, 
  TYPECAST_OPTIONS, 
  DATE_FORMAT_OPTIONS, 
  applyTransformationRules,
  getDefaultRuleForTarget
} from '../../utils/transformationRules';

export function TransformationDrawer({
  isOpen,
  onClose,
  sourceColumn,
  targetField,
  sampleRows = [],
  currentRules = {},
  onSaveRules,
  onResetRules
}) {
  const [localRules, setLocalRules] = useState(currentRules);

  useEffect(() => {
    if (isOpen) {
      setLocalRules(currentRules);
    }
  }, [isOpen, currentRules]);

  // Extract up to 3 distinct sample values from parsedRows
  const sampleValues = useMemo(() => {
    if (!sourceColumn || !sampleRows || sampleRows.length === 0) return ['Sample Value'];
    const list = [];
    for (const row of sampleRows.slice(0, 15)) {
      const v = row?.[sourceColumn];
      if (v !== undefined && v !== null && v !== '') {
        const str = String(v);
        if (!list.includes(str)) {
          list.push(str);
          if (list.length >= 3) break;
        }
      }
    }
    return list.length > 0 ? list : ['Sample Value'];
  }, [sourceColumn, sampleRows]);

  if (!isOpen || !sourceColumn) return null;

  const handleToggle = (key) => {
    setLocalRules((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleChange = (key, value) => {
    setLocalRules((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = () => {
    onSaveRules(sourceColumn, localRules);
    onClose();
  };

  const handleReset = () => {
    const defaults = getDefaultRuleForTarget(targetField);
    setLocalRules(defaults);
    onResetRules(sourceColumn);
  };

  // Run simulation on sample values
  const simulatedOutputs = sampleValues.map((val) => {
    return applyTransformationRules(val, localRules);
  });

  return (
    <div className="drawer-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-title-group">
            <div className="drawer-icon-wrap">
              <SlidersIcon size={20} className="text-cyan" />
            </div>
            <div>
              <h3>Column Transformation Rules</h3>
              <div className="drawer-mapping-chip-row">
                <span className="source-col-pill">{sourceColumn}</span>
                <ArrowRightIcon size={13} className="text-cyan" />
                <span className="target-col-pill">
                  {targetField?.name || 'target_field'} ({targetField?.type || 'String'})
                </span>
                {targetField?.required && (
                  <span className="required-badge">* Required</span>
                )}
              </div>
            </div>
          </div>

          <button className="search-clear-btn" onClick={onClose} aria-label="Close drawer">
            <XIcon size={18} />
          </button>
        </div>

        {/* Live Transformation Preview Card */}
        <div className="drawer-preview-box">
          <div className="preview-box-header">
            <SparklesIcon size={15} className="text-cyan" />
            <span>Live Transformation Simulator</span>
          </div>

          <div className="simulation-rows-container">
            {simulatedOutputs.map((sim, idx) => (
              <div key={idx} className="simulation-row">
                <div className="sim-col sim-input">
                  <span className="sim-label">RAW INPUT:</span>
                  <code className="sim-val" title={String(sim.original)}>
                    {JSON.stringify(sim.original)}
                  </code>
                </div>

                <div className="sim-arrow">
                  <ArrowRightIcon size={14} className="text-cyan" />
                </div>

                <div className="sim-col sim-output">
                  <span className="sim-label">TRANSFORMED:</span>
                  <code
                    className={`sim-val ${sim.isValid ? 'is-valid' : 'is-invalid'}`}
                    title={String(sim.output)}
                  >
                    {sim.output === null ? 'null' : JSON.stringify(sim.output)}
                  </code>
                </div>

                <div className="sim-steps-pill">
                  {sim.appliedSteps.slice(0, 2).join(', ') || 'No change'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Drawer Body - Rules Sections */}
        <div className="drawer-body">
          {/* Section 1: String Sanitization */}
          <div className="rule-section">
            <h4 className="rule-section-title">1. String Cleaning & Sanitization</h4>

            <label className="rule-checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(localRules.trim)}
                onChange={() => handleToggle('trim')}
                className="rule-checkbox"
              />
              <div className="rule-checkbox-label">
                <strong>Trim Whitespace</strong>
                <span>Strip leading and trailing whitespace characters (.trim())</span>
              </div>
            </label>

            <div className="rule-select-field">
              <label htmlFor="casing-select">Casing Conversion:</label>
              <select
                id="casing-select"
                className="rule-dropdown"
                value={localRules.casing || 'none'}
                onChange={(e) => handleChange('casing', e.target.value)}
              >
                {CASING_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label} — {opt.desc}
                  </option>
                ))}
              </select>
            </div>

            <label className="rule-checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(localRules.stripNonNumeric)}
                onChange={() => handleToggle('stripNonNumeric')}
                className="rule-checkbox"
              />
              <div className="rule-checkbox-label">
                <strong>Strip Non-Numeric Symbols</strong>
                <span>Remove symbols like $, €, commas before parsing numbers</span>
              </div>
            </label>
          </div>

          {/* Section 2: Type Casting */}
          <div className="rule-section">
            <h4 className="rule-section-title">2. Type Casting & Parsing</h4>

            <div className="rule-select-field">
              <label htmlFor="typecast-select">Destination Type Cast:</label>
              <select
                id="typecast-select"
                className="rule-dropdown"
                value={localRules.typeCast || 'string'}
                onChange={(e) => handleChange('typeCast', e.target.value)}
              >
                {TYPECAST_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label} — {opt.desc}
                  </option>
                ))}
              </select>
            </div>

            {localRules.typeCast === 'date' && (
              <div className="rule-select-field" style={{ marginTop: '0.75rem' }}>
                <label htmlFor="dateformat-select">Date Output Format:</label>
                <select
                  id="dateformat-select"
                  className="rule-dropdown"
                  value={localRules.dateFormat || 'YYYY-MM-DD'}
                  onChange={(e) => handleChange('dateFormat', e.target.value)}
                >
                  {DATE_FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label} ({opt.desc})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Section 3: Fallback & Default Values */}
          <div className="rule-section">
            <h4 className="rule-section-title">3. Fallbacks & Empty Value Handling</h4>

            <label className="rule-checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(localRules.nullifyEmpty)}
                onChange={() => handleToggle('nullifyEmpty')}
                className="rule-checkbox"
              />
              <div className="rule-checkbox-label">
                <strong>Nullify Empty String Inputs</strong>
                <span>Convert empty strings, "N/A", "null", or "-" into null</span>
              </div>
            </label>

            <div className="rule-select-field">
              <label htmlFor="default-val-input">Default Value Fallback:</label>
              <input
                id="default-val-input"
                type="text"
                className="rule-text-input"
                placeholder='e.g., 0, "UNKNOWN", "N/A"'
                value={localRules.defaultValue || ''}
                onChange={(e) => handleChange('defaultValue', e.target.value)}
              />
              <span className="rule-input-hint">
                Injected whenever input row is empty, null, or fails validation
              </span>
            </div>
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div className="drawer-footer">
          <Button
            variant="ghost"
            size="sm"
            icon={TrashIcon}
            onClick={handleReset}
            title="Reset rules to target schema defaults"
          >
            Reset to Defaults
          </Button>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
            >
              Cancel
            </Button>

            <Button
              variant="primary"
              size="sm"
              icon={CheckIcon}
              onClick={handleSave}
            >
              Apply Rules
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
