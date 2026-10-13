import React from 'react';
import { Button } from '../common/Button';
import {
  AlertTriangleIcon,
  AlertCircleIcon,
  SearchIcon,
  RefreshCwIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  FilterIcon,
  XIcon
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
 * FailedRowsInspector
 * Part 1: Architecture, Real-Time Data Fetching & Error Filtering Layer
 * Dev 3 Day 15 Deliverable (Part 1 of 3)
 */
export function FailedRowsInspector({
  jobId,
  liveErrors = [],
  onRowSelect = null,
  className = ''
}) {
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
    selectedRowId,
    isLoading,
    lastSyncedAt,
    setPage,
    setPageSize,
    setActiveCategory,
    setSearchQuery,
    setSelectedRowId,
    refresh
  } = useFailedRowsInspector({
    jobId,
    liveBuffer: liveErrors
  });

  const handleSelectRow = (row) => {
    const nextId = selectedRowId === row.id ? null : row.id;
    setSelectedRowId(nextId);
    if (onRowSelect) {
      onRowSelect(row);
    }
  };

  return (
    <div className={`failed-rows-inspector-card ${className}`}>
      {/* --------------------------------------------------------------------
          1. Header: Identity Block, Live DLQ Metric Badge & Sync
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
          4. Content Body: Summary Feed & Foundation for Part 2 Error Table
          -------------------------------------------------------------------- */}
      <div className="inspector-content-body">
        {isLoading && allFailedRows.length === 0 ? (
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
        ) : (
          <div className="inspector-rows-preview-container">
            {/* Rows list summary header (prelude to Part 2 expanded table) */}
            <div className="inspector-list-summary-bar">
              <span className="summary-status-tag">
                Active Filter: <strong>{activeCategory.replace('_', ' ')}</strong> ({totalFilteredCount} matches)
              </span>
              {lastSyncedAt && (
                <span className="summary-sync-tag text-muted font-mono">
                  Synced: {new Date(lastSyncedAt).toLocaleTimeString()}
                </span>
              )}
            </div>

            <div className="inspector-cards-list">
              {paginatedRows.map((row) => {
                const isSelected = selectedRowId === row.id;

                return (
                  <div
                    key={row.id}
                    className={`inspector-row-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => handleSelectRow(row)}
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
                      </div>
                    </div>

                    <div className="card-error-row">
                      <span className="error-dot red" />
                      <p className="card-error-text font-mono">
                        {row.scriptError}
                      </p>
                    </div>

                    {/* Part 1 Raw Row Preview Strip */}
                    <div className="card-raw-strip">
                      <span className="raw-label">Raw Values:</span>
                      <code className="raw-snippet">
                        {JSON.stringify(row.rawRow)}
                      </code>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
