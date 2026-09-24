import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { VariableSizeGrid } from 'react-window';
import { calculateColumnWidths } from '../../utils/columnAutoSizer';
import { CheckIcon, CopyIcon, SparklesIcon } from '../common/Icons';

export function VirtualizedDataGrid({
  headers = [],
  rows = [],
  searchQuery = '',
  estimatedTotalRows = 0
}) {
  const containerRef = useRef(null);
  const gridRef = useRef(null);
  const headerViewportRef = useRef(null);
  const isScrollingSyncRef = useRef(false);

  const [containerDimensions, setContainerDimensions] = useState({
    width: 1000,
    height: 560
  });

  const [copiedValue, setCopiedValue] = useState(null);

  const filteredRows = useMemo(() => {
    if (!searchQuery || !searchQuery.trim()) return rows;
    const query = searchQuery.toLowerCase().trim();

    return rows.filter((row) => {
      return Object.values(row).some((val) => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(query);
      });
    });
  }, [rows, searchQuery]);

  const { indexColWidth, columnWidths, totalWidth, getColumnWidth } = useMemo(() => {
    return calculateColumnWidths(headers, rows);
  }, [headers, rows]);

  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.resetAfterIndices({
        columnIndex: 0,
        rowIndex: 0,
        shouldForceUpdate: true
      });
    }
  }, [columnWidths, headers.length]);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const availableHeight = Math.max(460, Math.min(680, window.innerHeight - 280));
        setContainerDimensions({
          width: Math.floor(rect.width) || 1000,
          height: availableHeight
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const handleGridScroll = useCallback(({ scrollLeft }) => {
    if (isScrollingSyncRef.current) return;
    if (headerViewportRef.current) {
      headerViewportRef.current.scrollLeft = scrollLeft;
    }
  }, []);

  const handleHeaderScroll = useCallback((e) => {
    if (gridRef.current) {
      isScrollingSyncRef.current = true;
      gridRef.current.scrollTo({ scrollLeft: e.target.scrollLeft });
      setTimeout(() => {
        isScrollingSyncRef.current = false;
      }, 50);
    }
  }, []);

  const handleCellClick = useCallback((val) => {
    if (val === null || val === undefined) return;
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    navigator.clipboard?.writeText(str).then(() => {
      setCopiedValue(str);
      setTimeout(() => setCopiedValue(null), 1800);
    }).catch(() => {});
  }, []);

  const Cell = useCallback(({ columnIndex, rowIndex, style }) => {
    const row = filteredRows[rowIndex];
    if (!row) return null;

    if (columnIndex === 0) {
      return (
        <div style={style} className="grid-cell is-index" title={`Row ${rowIndex + 1}`}>
          #{rowIndex + 1}
        </div>
      );
    }

    const colName = headers[columnIndex - 1];
    const val = row[colName];
    const isEven = rowIndex % 2 === 0;

    let content = null;
    let customClass = '';

    if (val === null || val === undefined || val === '') {
      content = <span className="cell-null">null</span>;
    } else if (typeof val === 'number') {
      customClass = 'cell-num';
      content = <span className="cell-value-text">{val.toLocaleString()}</span>;
    } else {
      const strVal = String(val);
      const upper = strVal.toUpperCase();
      if (['COMPLETED', 'SUCCESS', 'ACTIVE', 'SETTLED'].includes(upper)) {
        content = <span className="cell-status-pill status-completed">{strVal}</span>;
      } else if (['PENDING', 'PROCESSING', 'FLAGGED'].includes(upper)) {
        content = <span className="cell-status-pill status-pending">{strVal}</span>;
      } else if (['SHIPPED', 'AUTHORIZED', 'TRANSIT'].includes(upper)) {
        content = <span className="cell-status-pill status-shipped">{strVal}</span>;
      } else if (['CANCELLED', 'REFUNDED', 'FAILED', 'REJECTED'].includes(upper)) {
        content = <span className="cell-status-pill status-cancelled">{strVal}</span>;
      } else {
        content = <span className="cell-value-text">{strVal}</span>;
      }
    }

    return (
      <div
        style={style}
        className={`grid-cell ${isEven ? 'row-even' : 'row-odd'} ${customClass}`}
        onClick={() => handleCellClick(val)}
        title={`Click to copy: ${val ?? 'null'}`}
      >
        {content}
      </div>
    );
  }, [filteredRows, headers, handleCellClick]);

  if (!rows || rows.length === 0) {
    return (
      <div className="grid-viewport-panel">
        <div className="empty-filter-state">
          <SparklesIcon size={36} className="text-cyan" />
          <h3>No preview data available</h3>
          <p className="text-muted text-sm">Upload a dataset or select a sample to preview rows here.</p>
        </div>
      </div>
    );
  }

  const columnCount = headers.length + 1;
  const rowCount = filteredRows.length;
  const rowHeight = 40;

  return (
    <div className="grid-viewport-panel" ref={containerRef}>
      <div 
        className="grid-header-viewport" 
        ref={headerViewportRef}
        onScroll={handleHeaderScroll}
        style={{ width: containerDimensions.width }}
      >
        <div className="grid-header-row" style={{ width: Math.max(totalWidth, containerDimensions.width) }}>
          <div 
            className="grid-header-cell is-index" 
            style={{ width: indexColWidth, minWidth: indexColWidth }}
          >
            #
          </div>

          {headers.map((colName, idx) => {
            const width = columnWidths[idx] || 140;
            return (
              <div
                key={colName}
                className="grid-header-cell"
                style={{ width, minWidth: width }}
                title={colName}
              >
                <span className="header-title-text">{colName}</span>
                <span className="header-type-tag">col</span>
              </div>
            );
          })}
        </div>
      </div>

      {filteredRows.length > 0 ? (
        <div className="grid-body-viewport">
          <VariableSizeGrid
            ref={gridRef}
            columnCount={columnCount}
            columnWidth={getColumnWidth}
            height={containerDimensions.height}
            rowCount={rowCount}
            rowHeight={() => rowHeight}
            width={containerDimensions.width}
            onScroll={handleGridScroll}
            overscanColumnCount={2}
            overscanRowCount={5}
          >
            {Cell}
          </VariableSizeGrid>
        </div>
      ) : (
        <div className="empty-filter-state" style={{ height: containerDimensions.height }}>
          <p className="text-cyan font-medium">No rows matching "{searchQuery}"</p>
          <span className="text-muted text-xs">Try searching for a different value or clear the search filter</span>
        </div>
      )}

      <div className="grid-footer-bar">
        <div className="footer-stats-group">
          <div className="footer-stat-item">
            <span>Showing:</span>
            <strong>{filteredRows.length.toLocaleString()} rows</strong>
            {searchQuery && <span className="text-cyan text-xs">(filtered)</span>}
          </div>
          <div className="footer-stat-item">
            <span>Columns:</span>
            <strong>{headers.length} fields</strong>
          </div>
          <div className="footer-stat-item">
            <span>Est. File Total:</span>
            <strong>{estimatedTotalRows ? estimatedTotalRows.toLocaleString() : 'Estimating...'}</strong>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted">
          <CopyIcon size={13} />
          <span>Click any cell to copy value</span>
        </div>
      </div>

      {copiedValue !== null && (
        <div className="copy-tooltip-toast">
          <CheckIcon size={16} />
          <span>Copied "{copiedValue.length > 25 ? copiedValue.slice(0, 25) + '...' : copiedValue}"</span>
        </div>
      )}
    </div>
  );
}
