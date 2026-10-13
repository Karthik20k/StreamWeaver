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
<<<<<<< HEAD
=======

export function inferColumnTypes(headers = [], sampleRows = []) {
  const types = {};
  if (!headers || headers.length === 0) return types;

  const rowsToScan = sampleRows.slice(0, 30);
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

  for (const col of headers) {
    let numCount = 0;
    let dateCount = 0;
    let boolCount = 0;
    let totalValid = 0;

    for (const row of rowsToScan) {
      const val = row?.[col];
      if (val === null || val === undefined || val === '') continue;
      totalValid++;

      if (typeof val === 'number') {
        numCount++;
      } else if (val instanceof Date) {
        dateCount++;
      } else if (typeof val === 'boolean' || val === 'true' || val === 'false') {
        boolCount++;
      } else if (typeof val === 'string') {
        if (!isNaN(Number(val)) && val.trim() !== '') {
          numCount++;
        } else if (isoDateRegex.test(val.trim()) || (!isNaN(Date.parse(val.trim())) && val.includes('-'))) {
          dateCount++;
        }
      }
    }

    if (totalValid === 0) {
      types[col] = 'str';
    } else if (numCount / totalValid >= 0.7) {
      types[col] = 'num';
    } else if (dateCount / totalValid >= 0.7) {
      types[col] = 'date';
    } else if (boolCount / totalValid >= 0.7) {
      types[col] = 'bool';
    } else {
      types[col] = 'str';
    }
  }

  return types;
}
>>>>>>> main
