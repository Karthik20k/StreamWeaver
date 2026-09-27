import React from 'react';
import { 
  XIcon, 
  AlertCircleIcon, 
  CheckCircleIcon, 
  ArrowRightIcon, 
  DatabaseIcon, 
  TrashIcon 
} from '../common/Icons';
import { Button } from '../common/Button';

export function ValidationDrawer({
  isOpen,
  onClose,
  validation,
  sourceHeaders = [],
  onSetMapping,
  onResolveDuplicate,
  onProceedToIngest
}) {
  if (!isOpen || !validation) return null;

  const {
    isValid,
    canProceed,
    errors = [],
    warnings = [],
    missingRequiredFields = [],
    duplicateTargetAlerts = [],
    typeWarnings = [],
    metrics = {}
  } = validation;

  return (
    <div className="drawer-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="drawer-panel validation-drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-title-group">
            <div className={`drawer-icon-wrap ${isValid ? 'emerald' : 'amber'}`}>
              {isValid ? <CheckCircleIcon size={20} className="text-emerald" /> : <AlertCircleIcon size={20} className="text-amber" />}
            </div>
            <div>
              <h3>Pre-Upload Validation Audit</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Verifies target constraints and duplicate mapping collisions
              </p>
            </div>
          </div>

          <button className="search-clear-btn" onClick={onClose} aria-label="Close validation drawer">
            <XIcon size={18} />
          </button>
        </div>

        {/* Validation Telemetry Bar */}
        <div className="validation-summary-grid">
          <div className={`val-kpi-chip ${metrics.missingRequiredCount === 0 ? 'is-good' : 'is-error'}`}>
            <span className="val-kpi-num">{metrics.satisfiedRequired || 0} / {metrics.totalRequired || 0}</span>
            <span className="val-kpi-label">Required Mapped</span>
          </div>

          <div className={`val-kpi-chip ${metrics.duplicateCount === 0 ? 'is-good' : 'is-error'}`}>
            <span className="val-kpi-num">{metrics.duplicateCount || 0}</span>
            <span className="val-kpi-label">Duplicate Collisions</span>
          </div>

          <div className={`val-kpi-chip ${metrics.warningCount === 0 ? 'is-good' : 'is-warn'}`}>
            <span className="val-kpi-num">{metrics.warningCount || 0}</span>
            <span className="val-kpi-label">Type Warnings</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="drawer-body">
          {/* Status Banner */}
          {isValid ? (
            <div className="validation-banner is-success">
              <CheckCircleIcon size={20} />
              <div>
                <strong>All Target Requirements Satisfied!</strong>
                <p>All required schema fields are mapped without collisions. Upload stream can proceed safely.</p>
              </div>
            </div>
          ) : (
            <div className="validation-banner is-error">
              <AlertCircleIcon size={20} />
              <div>
                <strong>Action Required Before Streaming</strong>
                <p>
                  Resolve the {errors.length} blocking validation issue{errors.length > 1 ? 's' : ''} below to enable ingestion.
                </p>
              </div>
            </div>
          )}

          {/* Section 1: Missing Required Fields */}
          {missingRequiredFields.length > 0 && (
            <div className="val-section">
              <h4 className="val-section-title">
                <span className="val-count-badge error-badge">{missingRequiredFields.length}</span>
                Missing Required Fields
              </h4>

              <div className="val-items-list">
                {missingRequiredFields.map((field) => (
                  <div key={field.name} className="val-card val-card-error">
                    <div className="val-card-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span className="target-field-name">{field.name}</span>
                        <span className="required-badge">* Required</span>
                      </div>
                      <span className={`type-tag ${field.type}`}>{field.type}</span>
                    </div>

                    {field.description && (
                      <p className="target-desc-text">{field.description}</p>
                    )}

                    <div className="val-quick-map-row">
                      <span className="binding-label">
                        <ArrowRightIcon size={13} className="text-cyan" />
                        Quick Map to Column:
                      </span>

                      <select
                        className="target-select-inline"
                        onChange={(e) => {
                          if (e.target.value) {
                            onSetMapping(e.target.value, field.name);
                          }
                        }}
                        defaultValue=""
                      >
                        <option value="">-- Choose source column --</option>
                        {sourceHeaders.map((src) => (
                          <option key={src} value={src}>
                            {src}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Duplicate Target Collisions */}
          {duplicateTargetAlerts.length > 0 && (
            <div className="val-section">
              <h4 className="val-section-title">
                <span className="val-count-badge error-badge">{duplicateTargetAlerts.length}</span>
                Duplicate Target Mappings
              </h4>

              <div className="val-items-list">
                {duplicateTargetAlerts.map((dup, idx) => (
                  <div key={idx} className="val-card val-card-error">
                    <div className="val-card-top">
                      <span className="target-field-name">Target: {dup.targetField}</span>
                      <span className="required-badge">Collision</span>
                    </div>

                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Multiple source columns are mapped to this target field. Pick which column to keep:
                    </p>

                    <div className="val-collision-actions">
                      {dup.conflictingSources.map((src) => (
                        <Button
                          key={src}
                          variant="outline"
                          size="sm"
                          onClick={() => onResolveDuplicate(dup.targetField, src)}
                          title={`Keep "${src}" and unbind other columns`}
                        >
                          Keep "{src}"
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Type Compatibility Warnings */}
          {typeWarnings.length > 0 && (
            <div className="val-section">
              <h4 className="val-section-title">
                <span className="val-count-badge warn-badge">{typeWarnings.length}</span>
                Type Compatibility Warnings
              </h4>

              <div className="val-items-list">
                {typeWarnings.map((warn, idx) => (
                  <div key={idx} className="val-card val-card-warning">
                    <div className="val-card-top">
                      <span className="source-col-name">{warn.sourceColumn}</span>
                      <ArrowRightIcon size={13} className="text-amber" />
                      <span className="target-field-name">{warn.targetField}</span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {warn.message}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="drawer-footer">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            Close
          </Button>

          <Button
            variant="primary"
            size="sm"
            disabled={!canProceed}
            onClick={() => {
              onClose();
              if (canProceed && onProceedToIngest) {
                onProceedToIngest();
              }
            }}
            title={canProceed ? 'Proceed to streaming upload' : 'Resolve blocking errors before proceeding'}
          >
            {canProceed ? 'Proceed to Ingest &rarr;' : 'Resolve Issues to Proceed'}
          </Button>
        </div>
      </div>
    </div>
  );
}
