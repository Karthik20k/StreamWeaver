import React, { useState } from 'react';
import { useErrorAudit } from '../../hooks/useErrorAudit';
import { Button } from '../common/Button';
import { 
  XIcon, 
  AlertCircleIcon, 
  CheckCircleIcon, 
  SearchIcon, 
  DownloadIcon, 
  FilterIcon, 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  RefreshCwIcon,
  ShieldCheckIcon,
  DatabaseIcon,
  ActivityIcon,
  TrashIcon
} from '../common/Icons';

export function ErrorAuditDrawer({
  isOpen,
  onClose,
  jobId,
  targetCollection = 'ecommerce_orders',
  totalProcessed = 0,
  isStreamActive = false,
  streamStatus = 'completed'
}) {
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  const {
    errors,
    totalErrors,
    totalPages,
    currentPage,
    limit,
    selectedField,
    searchQuery,
    isLoading,
    fetchError,
    distinctFields,
    errorMetrics,
    setPage,
    setLimit,
    setSelectedField,
    setSearchQuery,
    fetchErrors,
    exportErrorsAsJson,
    exportErrorsAsCsv,
    clearDlq
  } = useErrorAudit({
    jobId,
    initialLimit: 10,
    autoFetch: isOpen
  });

  if (!isOpen) return null;

  const toggleRowExpanded = (rowId) => {
    setExpandedRowId((prev) => (prev === rowId ? null : rowId));
  };

  const handleClearDlq = async () => {
    await clearDlq();
    setIsConfirmingClear(false);
  };

  // Calculate clean acceptance percentage
  const totalAttempted = (totalProcessed || 0) + totalErrors;
  const cleanRate = totalAttempted > 0 
    ? ((totalProcessed / totalAttempted) * 100).toFixed(1) 
    : '100.0';

  const startRecord = totalErrors === 0 ? 0 : (currentPage - 1) * limit + 1;
  const endRecord = Math.min(currentPage * limit, totalErrors);

  return (
    <div className="drawer-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Dead Letter Queue Error Audit">
      <div className="drawer-panel error-audit-drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* ------------------------------------------------------------------
            1. Drawer Header
            ------------------------------------------------------------------ */}
        <div className="drawer-header audit-drawer-header">
          <div className="drawer-title-group">
            <div className={`drawer-icon-wrap ${totalErrors > 0 ? 'amber' : 'emerald'}`}>
              {totalErrors > 0 ? <AlertCircleIcon size={22} className="text-amber" /> : <ShieldCheckIcon size={22} className="text-emerald" />}
            </div>
            <div>
              <h3>Dead Letter Queue (DLQ) Error Audit</h3>
              <div className="audit-subtitle-line">
                <span>Job: <code>{jobId || 'N/A'}</code></span>
                <span className="dot-divider" />
                <span>Target: <code>{targetCollection}</code></span>
                {isStreamActive && (
                  <>
                    <span className="dot-divider" />
                    <span className="audit-live-tag">LIVE STREAMING</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="audit-header-actions">
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCwIcon}
              onClick={() => fetchErrors()}
              disabled={isLoading}
              title="Refresh DLQ records"
            >
              Refresh
            </Button>

            <button className="search-clear-btn" onClick={onClose} aria-label="Close error audit drawer">
              <XIcon size={18} />
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------------
            2. Telemetry KPI Strip
            ------------------------------------------------------------------ */}
        <div className="audit-telemetry-strip">
          <div className="audit-kpi-chip">
            <span className="audit-kpi-num text-amber">{totalErrors.toLocaleString()}</span>
            <span className="audit-kpi-label">Isolated DLQ Errors</span>
          </div>

          <div className="audit-kpi-chip">
            <span className="audit-kpi-num text-emerald">{cleanRate}%</span>
            <span className="audit-kpi-label">Schema Compliance</span>
          </div>

          <div className="audit-kpi-chip">
            <span className="audit-kpi-num text-cyan">{errorMetrics.topFailedField}</span>
            <span className="audit-kpi-label">Top Failed Constraint</span>
          </div>

          <div className="audit-kpi-chip">
            <span className="audit-kpi-num text-purple">{distinctFields.length}</span>
            <span className="audit-kpi-label">Violated Fields</span>
          </div>
        </div>

        {/* ------------------------------------------------------------------
            3. Filter, Search & Export Toolbar
            ------------------------------------------------------------------ */}
        <div className="audit-filter-toolbar">
          <div className="audit-search-wrap">
            <SearchIcon size={15} className="audit-search-icon" />
            <input
              type="text"
              placeholder="Search by row #, error reason, or raw value..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="audit-search-input"
            />
            {searchQuery && (
              <button 
                className="audit-search-clear"
                onClick={() => {
                  setSearchQuery('');
                  setPage(1);
                }}
              >
                <XIcon size={13} />
              </button>
            )}
          </div>

          <div className="audit-actions-group">
            <div className="audit-field-select-wrap">
              <FilterIcon size={14} className="text-muted" />
              <select
                value={selectedField}
                onChange={(e) => {
                  setSelectedField(e.target.value);
                  setPage(1);
                }}
                className="audit-select"
                aria-label="Filter by failed field"
              >
                <option value="all">All Fields ({distinctFields.length})</option>
                {distinctFields.map((f) => (
                  <option key={f} value={f}>
                    {f} ({errorMetrics.fieldCounts[f] || 0})
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              icon={DownloadIcon}
              onClick={exportErrorsAsJson}
              disabled={totalErrors === 0}
              title="Download entire DLQ records as JSON"
            >
              JSON
            </Button>

            <Button
              variant="outline"
              size="sm"
              icon={DownloadIcon}
              onClick={exportErrorsAsCsv}
              disabled={totalErrors === 0}
              title="Download entire DLQ records as CSV"
            >
              CSV
            </Button>
          </div>
        </div>

        {/* ------------------------------------------------------------------
            4. Drawer Body - Handling 4 Explicit UI States
            ------------------------------------------------------------------ */}
        <div className="drawer-body audit-drawer-body">
          {/* STATE 1: Error / Failure Banner */}
          {fetchError && (
            <div className="audit-state-banner is-error">
              <AlertCircleIcon size={20} className="text-amber" />
              <div style={{ flex: 1 }}>
                <span className="banner-title">Error Log Retrieval Interrupted</span>
                <p>{fetchError}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => fetchErrors()}>
                Retry Query
              </Button>
            </div>
          )}

          {/* Stream Aborted / Failure Alert */}
          {streamStatus === 'aborted' && (
            <div className="audit-state-banner is-warn">
              <ActivityIcon size={20} className="text-cyan" />
              <div style={{ flex: 1 }}>
                <span className="banner-title">Streaming Ingestion Aborted</span>
                <p>The ingestion pipeline was terminated before full completion. Partial records prior to termination are recorded below.</p>
              </div>
            </div>
          )}

          {/* STATE 2: Loading Skeleton State */}
          {isLoading ? (
            <div className="audit-loading-container" aria-busy="true" aria-label="Loading error records">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="audit-skeleton-card">
                  <div className="skeleton-row">
                    <div className="skeleton-pill shimmer" style={{ width: '80px' }} />
                    <div className="skeleton-pill shimmer" style={{ width: '110px' }} />
                    <div className="skeleton-pill shimmer" style={{ width: '90px', marginLeft: 'auto' }} />
                  </div>
                  <div className="skeleton-line shimmer" style={{ width: '70%', marginTop: '0.6rem' }} />
                  <div className="skeleton-line shimmer" style={{ width: '45%', marginTop: '0.4rem' }} />
                </div>
              ))}
            </div>
          ) : totalErrors === 0 ? (
            /* STATE 3: Empty State (Zero Data Anomalies) */
            <div className="audit-empty-state">
              <div className="audit-empty-orb">
                <ShieldCheckIcon size={40} className="text-emerald" />
              </div>
              <h4>Zero DLQ Anomalies Isolated</h4>
              <p>
                All <strong>{totalProcessed.toLocaleString()} records</strong> conformed strictly to the target schema constraints.
                Type casting, date parsing, and required constraints executed with 100% precision.
              </p>
              <div className="audit-empty-meta">
                <span>Target: <code>{targetCollection}</code></span>
                <span className="dot-divider" />
                <span className="text-emerald">Clean MongoDB Commit</span>
              </div>
            </div>
          ) : errors.length === 0 ? (
            /* Empty State for Filter No-Matches */
            <div className="audit-no-matches-state">
              <SearchIcon size={28} className="text-muted" />
              <h4>No Errors Match Current Filters</h4>
              <p>Try searching for a different keyword or resetting the field filter.</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSelectedField('all');
                  setSearchQuery('');
                }}
              >
                Reset Filter & Search
              </Button>
            </div>
          ) : (
            /* STATE 4: Success / Populated Error Records List */
            <div className="audit-errors-list">
              {errors.map((err, idx) => {
                const isExpanded = expandedRowId === err.id || expandedRowId === `row-${err.rowNumber}`;
                const rawObj = err.rawData || {};

                return (
                  <div key={err.id || idx} className={`audit-error-card ${isExpanded ? 'is-expanded' : ''}`}>
                    <div className="audit-card-top" onClick={() => toggleRowExpanded(err.id || `row-${err.rowNumber}`)}>
                      <div className="audit-card-badges">
                        <span className="audit-row-badge">Row #{err.rowNumber}</span>
                        <span className="audit-field-badge">{err.failedField}</span>
                        <span className="audit-type-pill">Rejected</span>
                      </div>

                      <div className="audit-card-meta">
                        <span className="audit-timestamp">
                          {new Date(err.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span className="audit-expand-chevron">
                          {isExpanded ? '▲ Hide Raw Input' : '▼ Inspect Raw Input'}
                        </span>
                      </div>
                    </div>

                    <div className="audit-reason-row">
                      <AlertCircleIcon size={16} className="text-amber flex-shrink-0" />
                      <span className="audit-reason-text">{err.rejectedReason}</span>
                    </div>

                    {/* Expandable Raw Data Inspector */}
                    {isExpanded && (
                      <div className="audit-raw-inspector">
                        <div className="raw-inspector-header">
                          <span>Raw CSV Input Payload (Source Record)</span>
                          <span className="raw-byte-count">
                            {JSON.stringify(rawObj).length} bytes
                          </span>
                        </div>

                        <div className="raw-grid-table">
                          {Object.entries(rawObj).map(([col, val]) => {
                            const isFailed = col.toLowerCase() === (err.failedField || '').toLowerCase();
                            return (
                              <div key={col} className={`raw-table-row ${isFailed ? 'is-offending' : ''}`}>
                                <div className="raw-col-cell">
                                  <span>{col}</span>
                                  {isFailed && <span className="offending-tag">Failed Field</span>}
                                </div>
                                <div className="raw-val-cell">
                                  <code>{String(val)}</code>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------
            5. Sticky Pagination & Audit Footer
            ------------------------------------------------------------------ */}
        {totalErrors > 0 && (
          <div className="audit-footer-bar">
            <div className="audit-page-info">
              <span>Showing <strong>{startRecord}</strong> - <strong>{endRecord}</strong> of <strong>{totalErrors}</strong> isolated errors</span>
            </div>

            <div className="audit-pagination-controls">
              <Button
                variant="outline"
                size="sm"
                icon={ChevronLeftIcon}
                disabled={currentPage <= 1 || isLoading}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>

              <div className="audit-page-pills">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p = i + 1;
                  if (totalPages > 5 && currentPage > 3) {
                    p = currentPage - 2 + i;
                    if (p > totalPages) p = totalPages - (4 - i);
                  }
                  return (
                    <button
                      key={p}
                      className={`audit-page-pill ${currentPage === p ? 'is-active' : ''}`}
                      onClick={() => setPage(p)}
                      disabled={isLoading}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                icon={ChevronRightIcon}
                disabled={currentPage >= totalPages || isLoading}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>

            <div className="audit-limit-wrap">
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Per Page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="audit-limit-select"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
