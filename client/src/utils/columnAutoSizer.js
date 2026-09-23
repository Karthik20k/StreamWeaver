export function calculateColumnWidths(headers = [], sampleRows = [], options = {}) {
  const {
    minWidth = 130,
    maxWidth = 360,
    charWidthPx = 8.5,
    paddingPx = 36,
    indexColWidth = 64
  } = options;

  if (!headers || headers.length === 0) {
    return {
      columnWidths: [],
      totalWidth: 0,
      getColumnWidth: () => minWidth
    };
  }

  const rowsToScan = sampleRows.slice(0, 50);

  const columnWidths = headers.map((colName) => {
    let maxCharLen = colName ? colName.length : 10;

    for (let i = 0; i < rowsToScan.length; i++) {
      const val = rowsToScan[i]?.[colName];
      if (val !== undefined && val !== null) {
        const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
        if (strVal.length > maxCharLen) {
          maxCharLen = strVal.length;
        }
      }
    }

    const calculatedWidth = Math.ceil(maxCharLen * charWidthPx + paddingPx);
    return Math.max(minWidth, Math.min(maxWidth, calculatedWidth));
  });

  const totalColumnsWidth = columnWidths.reduce((acc, w) => acc + w, 0);
  const totalWidth = totalColumnsWidth + indexColWidth;

  const getColumnWidth = (index) => {
    if (index === 0) return indexColWidth;
    return columnWidths[index - 1] || minWidth;
  };

  return {
    indexColWidth,
    columnWidths,
    totalWidth,
    getColumnWidth
  };
}
