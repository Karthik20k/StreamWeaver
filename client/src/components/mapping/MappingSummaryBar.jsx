import React from 'react';
import { 
  CheckCircleIcon, 
  AlertCircleIcon, 
  LayersIcon, 
  DatabaseIcon, 
  ZapIcon 
} from '../common/Icons';

export function MappingSummaryBar({
  stats,
  activeSchema
}) {
  const {
    totalSource = 0,
    totalTarget = 0,
    mappedCount = 0,
    requiredCount = 0,
    mappedRequiredCount = 0,
    unmappedRequiredCount = 0,
    isAllRequiredMapped = false,
    completionPercentage = 0
  } = stats || {};

  return (
    <div className="mapping-kpi-bar">
      <div className="mapping-kpi-item">
        <div className="kpi-icon-wrap cyan">
          <LayersIcon size={20} />
        </div>
        <div className="kpi-content">
          <span className="kpi-label">Source Columns</span>
          <div className="kpi-value-row">
            <span className="kpi-val">{mappedCount}</span>
            <span className="kpi-sub">/ {totalSource} mapped</span>
          </div>
        </div>
      </div>

      <div className="mapping-kpi-item">
        <div className="kpi-icon-wrap purple">
          <DatabaseIcon size={20} />
        </div>
        <div className="kpi-content">
          <span className="kpi-label">Target Destination</span>
          <div className="kpi-value-row">
            <span className="kpi-val">{activeSchema?.fields?.length || totalTarget}</span>
            <span className="kpi-sub">fields ({activeSchema?.targetCollection || 'db'})</span>
          </div>
        </div>
      </div>

      <div className="mapping-kpi-item">
        <div className={`kpi-icon-wrap ${isAllRequiredMapped ? 'emerald' : 'amber'}`}>
          {isAllRequiredMapped ? <CheckCircleIcon size={20} /> : <AlertCircleIcon size={20} />}
        </div>
        <div className="kpi-content">
          <span className="kpi-label">Required Fields</span>
          <div className="kpi-value-row">
            <span className="kpi-val">{mappedRequiredCount}</span>
            <span className="kpi-sub">
              / {requiredCount} {isAllRequiredMapped ? 'satisfied' : `(${unmappedRequiredCount} missing)`}
            </span>
          </div>
        </div>
      </div>

      <div className="mapping-kpi-item">
        <div className={`kpi-icon-wrap ${isAllRequiredMapped ? 'emerald' : 'cyan'}`}>
          <ZapIcon size={20} />
        </div>
        <div className="kpi-content">
          <span className="kpi-label">Pipeline Readiness</span>
          <div className="kpi-value-row">
            <span className="kpi-val">{completionPercentage}%</span>
            <span className="kpi-sub">{isAllRequiredMapped ? 'Ready to stream' : 'Pending required'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
