import React, { useState } from 'react';
import { Button } from '../common/Button';
import {
  AlertTriangleIcon,
  AlertCircleIcon,
  SearchIcon,
  RefreshCwIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckCircleIcon,
  FilterIcon,
  XIcon,
  CopyIcon,
  CheckIcon,
  CodeIcon,
  ClockIcon,
  ZapIcon
} from '../common/Icons';
import { ERROR_CATEGORIES, useFailedRowsInspector } from '../../hooks/useFailedRowsInspector';

/**
 * Category Configuration Metadata
 */
const CATEGORY_TABS = [
  { key: ERROR_CATEGORIES.ALL, label: 'All Rejected Rows', color: 'cyan' },
  { key: ERROR_CATEGORIES.VALIDATION_THROW, label: 'Validation Throws', color: 'amber' },
  { key: ERROR_CATEGORIES.SYNTAX_ERROR, label: 'Syntax Exceptions', color: 'purple' },
  { key: ERROR_CATEGORIES.TIMEOUT_TERMINATION, label: 'Watchdog Timeouts', color: 'crimson' },
  { key: ERROR_CATEGORIES.TYPE_MISMATCH, label: 'Type Cast Failures', color: 'blue' }
];

/**
 * InlineExceptionDebugger
 * Detailed inline inspection panel rendering exact script error trace,
 * isolate execution latency, and formatted raw record with red failed-cell highlighting.
 * Dev 3 Day 15 Part 2 Deliverable
 */
export function InlineExceptionDebugger({
  row,
  copiedTarget,
  onCopy
}) {
  if (!row) return null;

  const rawEntries = Object.entries(row.rawRow || {});
  const isTimeout = row.errorCategory === ERROR_CATEGORIES.TIMEOUT_TERMINATION || row.executionTimeMs >= 50;

  return (
    <div className="inline-exception-panel" role="region" aria-label={`Error details for line ${row.lineNumber}`}>
      {/* ------------------------------------------------------------------
          1. Left Pane: Sandbox Exception Trace & Diagnostics
          ------------------------------------------------------------------ */}
      <div className="exception-diagnostics-pane">
        <div className="pane-header">
          <div className="pane-title-group">
            <span className="pane-icon-orb red">
              <AlertCircleIcon size={14} className="text-crimson" />
            </span>
            <span className="pane-title">ISOLATED-VM EXCEPTION TRACE</span>
          </div>

          <div className="pane-badges-group">
            <span className={`category-tag is-${row.errorCategory?.toLowerCase()}`}>
              {row.errorCategory}
            </span>
            <span className={`watchdog-latency-pill font-mono ${isTimeout ? 'is-danger' : ''}`}>
              <ClockIcon size={11} />
              <span>{row.executionTimeMs} ms</span>
              {isTimeout && <span className="watchdog-alert">(&ge;50ms Cap)</span>}
            </span>
          </div>
        </div>

        {/* Exact Exception Message Box */}
        <div className="exception-code-box">
          <div className="code-box-header">
            <span className="code-lang-label font-mono">V8 Runtime Throw</span>
            <button
              type="button"
              className="copy-snippet-btn"
              onClick={() => onCopy(row.scriptError, `err-${row.id}`)}
              title="Copy exact exception message"
            >
              {copiedTarget === `err-${row.id}` ? (
                <>
                  <CheckIcon size={12} className="text-emerald" />
                  <span className="text-emerald font-mono">Copied</span>
                </>
              ) : (
                <>
                  <CopyIcon size={12} />
                  <span>Copy Error</span>
                </>
              )}
            </button>
          </div>
          <pre className="exception-pre-text font-mono">
            <code>{row.scriptError}</code>
          </pre>
        </div>

        {/* Diagnostic Metadata Footer */}
        <div className="exception-meta-footer">
          <div className="meta-item">
            <span className="meta-label">REJECTED TARGET COLUMN</span>
            <span className="meta-value text-crimson font-mono font-bold">
              {row.failedColumn}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">SOURCE CSV LINE</span>
            <span className="meta-value text-cyan font-mono">
              Line #{row.lineNumber}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">ISOLATE DISPATCH TIMESTAMP</span>
            <span className="meta-value text-muted font-mono">
              {row.timestamp ? new Date(row.timestamp).toLocaleTimeString() : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------
          2. Right Pane: Raw Record Payload & Red Failed-Cell Highlighting
          ------------------------------------------------------------------ */}
      <div className="raw-record-inspector-pane">
        <div className="pane-header">
          <div className="pane-title-group">
            <span className="pane-icon-orb cyan">
              <CodeIcon size={14} className="text-cyan" />
            </span>
            <span className="pane-title">RAW RECORD CELL INSPECTOR</span>
            <span className="attribute-count-pill font-mono">
              {rawEntries.length} Columns
            </span>
          </div>

          <button
            type="button"
            className="copy-snippet-btn"
            onClick={() => onCopy(JSON.stringify(row.rawRow, null, 2), `json-${row.id}`)}
            title="Copy entire raw row as formatted JSON"
          >
            {copiedTarget === `json-${row.id}` ? (
              <>
                <CheckIcon size={12} className="text-emerald" />
                <span className="text-emerald font-mono">JSON Copied</span>
              </>
            ) : (
              <>
                <CopyIcon size={12} />
                <span>Copy JSON</span>
              </>
            )}
          </button>
        </div>

        {/* Interactive Attribute Grid with Red Failed-Cell Highlighting */}
        <div className="raw-attributes-grid">
          {rawEntries.map(([key, val]) => {
            const isFailedCell = key.toLowerCase() === (row.failedColumn || '').toLowerCase();
            const valType = val === null ? 'null' : typeof val;
            const displayVal = val === null ? 'null' : typeof val === 'object' ? JSON.stringify(val) : String(val);

            return (
              <div
                key={key}
                className={`attribute-cell-card ${isFailedCell ? 'failed-cell-highlight' : ''}`}
                title={isFailedCell ? `Failed column: ${row.scriptError}` : `${key}: ${displayVal}`}
              >
                <div className="cell-key-row">
                  <span className="cell-key-name font-mono">{key}</span>
                  {isFailedCell ? (
                    <span className="failed-tag-badge">
                      <AlertTriangleIcon size={10} />
                      FAILED CELL
                    </span>
                  ) : (
                    <span className="cell-type-badge font-mono">[{valType}]</span>
                  )}
                </div>
                <div className="cell-value-box font-mono">
                  {displayVal || <em className="text-muted font-sans">&lt;empty&gt;</em>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * FailedRowsInspector
 * Complete Error Inspection & Failed-Record Highlight View
 * Dev 3 Day 15 Deliverable (Part 2: Highlighted Error Table & Inline Debugger)
 */
export function FailedRowsInspector({
  jobId,
  liveErrors = [],
  onRowSelect = null,
  className = ''
}) {
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'cards'
  const [expandedRowIds, setExpandedRowIds] = useState(new Set());
  const [copiedTarget, setCopiedTarget] = useState(null);

  const {
    filteredRows,
    paginatedRows,
    totalCount,
    totalFilteredCount,
    totalPages,
    page,
    pageSize,
    activeCategory,
    categoryCounts,
    searchQuery,
    isLoading,
    lastSyncedAt,
    setPage,
    setPageSize,
    setActiveCategory,
    setSearchQuery,
    refresh
  } = useFailedRowsInspector({
    jobId,
    liveBuffer: liveErrors
  });

  const handleCopy = (text, targetId) => {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(text);
    setCopiedTarget(targetId);
    setTimeout(() => setCopiedTarget(null), 2000);
  };

  const toggleRowExpanded = (rowId) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });

    if (onRowSelect) {
      const found = paginatedRows.find((r) => r.id === rowId);
      if (found) onRowSelect(found);
    }
  };

  const expandAllCurrentPage = () => {
    setExpandedRowIds(new Set(paginatedRows.map((r) => r.id)));
  };

  const collapseAllCurrentPage = () => {
    setExpandedRowIds(new Set());
  };

  return (
    <div className={`failed-rows-inspector-card ${className}`}>
      {/* --------------------------------------------------------------------
          1. Header: Identity Block, Live DLQ Metric Badge & Controls
          -------------------------------------------------------------------- */}
      <div className="failed-rows-header">
        <div className="inspector-identity-block">
          <div className="inspector-icon-square">
            <AlertTriangleIcon size={20} className="text-amber" />
          </div>
          <div>
            <div className="inspector-title-row">
              <h3>Failed Rows Inspector</h3>
              <span className="dlq-count-badge">
                {totalCount} Rejected {totalCount === 1 ? 'Record' : 'Records'}
              </span>
              <span className="live-buffer-badge">
                <span className="live-pulse-dot" />
                Live DLQ Feed
              </span>
            </div>
            <p className="inspector-subtitle">
              Visual debugging panel for isolated-vm exceptions, constraint rejections, and schema DLQ routes
            </p>
          </div>
        </div>

        <div className="inspector-actions-group">
          {/* View Mode Toggle: Table vs Cards */}
          <div className="inspector-view-switcher">
            <button
              type="button"
              className={`view-switch-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table View with Red Column Highlighting"
            >
              Table View
            </button>
            <button
              type="button"
              className={`view-switch-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Compact Card View"
            >
              Card View
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            icon={RefreshCwIcon}
            onClick={refresh}
            disabled={isLoading}
            title="Synchronize failed rows with backend DLQ"
          >
            {isLoading ? 'Syncing...' : 'Sync Feed'}
          </Button>
        </div>
      </div>

      {/* --------------------------------------------------------------------
          2. Category Filter Strip: Validation, Syntax, Timeout, Type Mismatch
          -------------------------------------------------------------------- */}
      <div className="category-filter-strip" role="tablist" aria-label="Error Categories">
        {CATEGORY_TABS.map((tab) => {
          const count = categoryCounts[tab.key] || 0;
          const isActive = activeCategory === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`category-tab-btn is-${tab.color} ${isActive ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory(tab.key);
                setPage(1);
              }}
            >
              <span>{tab.label}</span>
              <span className="category-count-badge">{count}</span>
            </button>
          );
        })}
      </div>

      {/* --------------------------------------------------------------------
          3. Search & Pagination Toolbar
          -------------------------------------------------------------------- */}
      <div className="inspector-toolbar">
        {/* Search Input Bar */}
        <div className="inspector-search-bar">
          <SearchIcon size={15} className="search-icon text-muted" />
          <input
            type="text"
            className="search-input"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by failed column, line #, or exception message..."
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <XIcon size={14} />
            </button>
          )}
        </div>

        {/* Expand / Collapse All Helpers */}
        {totalFilteredCount > 0 && (
          <div className="inspector-bulk-toggle-group">
            <button
              type="button"
              className="bulk-toggle-btn"
              onClick={expandedRowIds.size === paginatedRows.length ? collapseAllCurrentPage : expandAllCurrentPage}
            >
              {expandedRowIds.size === paginatedRows.length ? 'Collapse All' : 'Expand All'}
            </button>
          </div>
        )}

        {/* Page Size & Pagination Summary */}
        <div className="inspector-pagination-meta">
          <div className="page-size-selector">
            <span className="size-label">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="page-size-select"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          <span className="pagination-count-label">
            Showing <strong>{totalFilteredCount > 0 ? (page - 1) * pageSize + 1 : 0}</strong>–
            <strong>{Math.min(page * pageSize, totalFilteredCount)}</strong> of <strong>{totalFilteredCount}</strong>
          </span>

          <div className="pagination-btn-group">
            <button
              type="button"
              className="pagination-nav-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeftIcon size={16} />
            </button>
            <span className="page-indicator font-mono">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              className="pagination-nav-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <ChevronRightIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------------
          4. Content Body: Highlighted Error Table & Inline Debugger
          -------------------------------------------------------------------- */}
      <div className="inspector-content-body">
        {isLoading && totalCount === 0 ? (
          <div className="inspector-loading-state">
            <RefreshCwIcon size={24} className="spinning text-cyan" />
            <p>Querying isolated-vm DLQ error repository...</p>
          </div>
        ) : totalCount === 0 ? (
          <div className="failed-rows-empty-state is-clean">
            <div className="empty-icon-circle green">
              <CheckCircleIcon size={32} />
            </div>
            <h4>Zero Rejected Records</h4>
            <p>All stream chunks passed through isolated-vm transformation rules and MongoDB validation guardrails cleanly.</p>
          </div>
        ) : totalFilteredCount === 0 ? (
          <div className="failed-rows-empty-state is-filtered">
            <div className="empty-icon-circle amber">
              <FilterIcon size={28} />
            </div>
            <h4>No Records Match Filters</h4>
            <p>No failed records found matching category <strong>{activeCategory}</strong> with query &ldquo;{searchQuery}&rdquo;.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveCategory(ERROR_CATEGORIES.ALL);
                setSearchQuery('');
              }}
            >
              Reset Filters
            </Button>
          </div>
        ) : viewMode === 'table' ? (
          /* =================================================================
             View 1: Highlighted Error Table with Inline Expanders (Day 15 Spec)
             ================================================================= */
          <div className="inspector-table-container">
            <table className="failed-rows-table" aria-label="Failed Rows Table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }} aria-label="Toggle expand" />
                  <th style={{ width: '90px' }}>Line #</th>
                  <th style={{ width: '160px' }}>Failed Column</th>
                  <th style={{ width: '180px' }}>Exception Category</th>
                  <th style={{ width: '110px' }}>Latency</th>
                  <th>Inline Exception Message</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => {
                  const isExpanded = expandedRowIds.has(row.id);

                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        className={`failed-row-tr ${isExpanded ? 'is-expanded' : ''}`}
                        onClick={() => toggleRowExpanded(row.id)}
                      >
                        <td className="expand-caret-cell">
                          <button
                            type="button"
                            className="caret-btn"
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                          >
                            {isExpanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                          </button>
                        </td>

                        <td className="line-num-cell font-mono">
                          <span className="line-number-pill">#{row.lineNumber}</span>
                        </td>

                        {/* Highlighted failed column in red (Day 15 Spec) */}
                        <td className="failed-column-cell">
                          <span className="failed-column-pill">
                            <span className="col-dot red" />
                            <strong className="text-crimson font-mono">{row.failedColumn}</strong>
                          </span>
                        </td>

                        <td className="category-cell">
                          <span className={`category-tag is-${row.errorCategory?.toLowerCase()}`}>
                            {row.errorCategory}
                          </span>
                        </td>

                        <td className="latency-cell font-mono">
                          <span className={`latency-tag ${row.executionTimeMs >= 50 ? 'is-warn' : ''}`}>
                            {row.executionTimeMs} ms
                          </span>
                        </td>

                        <td className="exception-summary-cell font-mono">
                          <span className="inline-exception-summary" title={row.scriptError}>
                            {row.scriptError}
                          </span>
                        </td>

                        <td className="row-actions-cell" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className={`inspect-row-btn ${isExpanded ? 'active' : ''}`}
                            onClick={() => toggleRowExpanded(row.id)}
                          >
                            {isExpanded ? 'Close' : 'Inspect'}
                          </button>
                        </td>
                      </tr>

                      {/* Inline Expanded Debugger Row */}
                      {isExpanded && (
                        <tr className="inspector-expanded-tr">
                          <td colSpan={7} className="expanded-content-td">
                            <InlineExceptionDebugger
                              row={row}
                              copiedTarget={copiedTarget}
                              onCopy={handleCopy}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* =================================================================
             View 2: Card View (Alternative compact representation)
             ================================================================= */
          <div className="inspector-cards-list">
            {paginatedRows.map((row) => {
              const isExpanded = expandedRowIds.has(row.id);

              return (
                <div
                  key={row.id}
                  className={`inspector-row-card ${isExpanded ? 'is-selected' : ''}`}
                  onClick={() => toggleRowExpanded(row.id)}
                >
                  <div className="card-top-row">
                    <div className="line-column-badge">
                      <span className="line-number-pill">Line #{row.lineNumber}</span>
                      <span className="failed-col-pill text-crimson">
                        Column: <strong>{row.failedColumn}</strong>
                      </span>
                    </div>
                    <div className="card-meta-right">
                      <span className={`category-tag is-${row.errorCategory?.toLowerCase()}`}>
                        {row.errorCategory}
                      </span>
                      <span className="exec-time-tag font-mono">
                        {row.executionTimeMs} ms
                      </span>
                      <button
                        type="button"
                        className="caret-btn"
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="card-error-row">
                    <span className="error-dot red" />
                    <p className="card-error-text font-mono">
                      {row.scriptError}
                    </p>
                  </div>

                  {isExpanded ? (
                    <div className="card-expanded-debugger" onClick={(e) => e.stopPropagation()}>
                      <InlineExceptionDebugger
                        row={row}
                        copiedTarget={copiedTarget}
                        onCopy={handleCopy}
                      />
                    </div>
                  ) : (
                    <div className="card-raw-strip">
                      <span className="raw-label">Raw Values:</span>
                      <code className="raw-snippet">
                        {JSON.stringify(row.rawRow)}
                      </code>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
