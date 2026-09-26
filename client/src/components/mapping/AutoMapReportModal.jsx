import React from 'react';
import { 
  XIcon, 
  SparklesIcon, 
  CheckCircleIcon, 
  ArrowRightIcon, 
  AlertCircleIcon 
} from '../common/Icons';
import { Button } from '../common/Button';

export function AutoMapReportModal({
  isOpen,
  onClose,
  report
}) {
  if (!isOpen || !report) return null;

  const { matchDetails = [], summary = {} } = report;
  const { breakdown = {} } = summary;

  return (
    <div className="json-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="json-modal-dialog automap-modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="json-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div className="drawer-icon-wrap" style={{ width: 34, height: 34 }}>
              <SparklesIcon size={18} className="text-cyan" />
            </div>
            <div>
              <h3>Auto-Mapping Heuristics Report</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Fuzzy, synonym, and normalized matching results
              </p>
            </div>
          </div>
          <button className="search-clear-btn" onClick={onClose} aria-label="Close report">
            <XIcon size={18} />
          </button>
        </div>

        {/* Summary Badges Bar */}
        <div className="automap-kpi-bar">
          <div className="automap-kpi-chip">
            <span className="kpi-num text-cyan">{summary.matchedCount || 0}</span>
            <span className="kpi-desc">/ {summary.totalSource || 0} Matched</span>
          </div>

          <div className="automap-kpi-chip">
            <span className="kpi-num text-emerald">{breakdown.exact || 0}</span>
            <span className="kpi-desc">Exact</span>
          </div>

          <div className="automap-kpi-chip">
            <span className="kpi-num text-purple">{breakdown.synonym || 0}</span>
            <span className="kpi-desc">Synonyms</span>
          </div>

          <div className="automap-kpi-chip">
            <span className="kpi-num text-amber">{breakdown.fuzzy || 0}</span>
            <span className="kpi-desc">Fuzzy</span>
          </div>

          <div className="automap-kpi-chip">
            <span className="kpi-num">{summary.unmatchedSourceCount || 0}</span>
            <span className="kpi-desc">Unmatched</span>
          </div>
        </div>

        {/* Matches List */}
        <div className="automap-matches-list">
          <div className="automap-list-header">
            <span>SOURCE CSV COLUMN</span>
            <span>TARGET DATABASE FIELD</span>
            <span>CONFIDENCE</span>
          </div>

          {matchDetails.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No automatic matches found with current fuzzy threshold.
            </div>
          ) : (
            matchDetails.map((match, idx) => {
              const confidenceClass = 
                match.matchType === 'exact' ? 'exact' :
                match.matchType === 'synonym' ? 'synonym' :
                match.matchType === 'token' ? 'token' : 'fuzzy';

              return (
                <div key={idx} className="automap-match-row">
                  <div className="automap-col-name">
                    <code>{match.sourceColumn}</code>
                  </div>

                  <div className="automap-target-col">
                    <ArrowRightIcon size={14} className="text-cyan" />
                    <strong>{match.targetField}</strong>
                    <span className="target-type-sub">({match.targetType})</span>
                    {match.isRequired && (
                      <span className="required-badge" style={{ fontSize: '0.62rem' }}>Required</span>
                    )}
                  </div>

                  <div className="automap-confidence-col">
                    <span className={`confidence-pill ${confidenceClass}`}>
                      {match.scoreLabel}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Unmatched Notice */}
        {summary.missingRequiredTargets && summary.missingRequiredTargets.length > 0 && (
          <div className="automap-warning-banner">
            <AlertCircleIcon size={16} className="text-amber" />
            <span>
              <strong>Required Target Fields Remaining Unmapped:</strong>{' '}
              {summary.missingRequiredTargets.join(', ')}
            </span>
          </div>
        )}

        <div className="json-modal-footer">
          <Button
            variant="primary"
            size="sm"
            onClick={onClose}
          >
            Apply & Close
          </Button>
        </div>
      </div>
    </div>
  );
}
