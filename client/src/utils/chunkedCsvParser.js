import Papa from 'papaparse';

export async function parseChunkedFile(file, options = {}) {
  const {
    maxSliceBytes = 1024 * 1024,
    maxRows = 1000,
    delimiter = '',
    dynamicTyping = true
  } = options;

  if (!file) {
    throw new Error('No file provided for parsing.');
  }

  const startTime = performance.now();
  const sliceSize = Math.min(file.size, maxSliceBytes);
  const fileSlice = file.slice(0, sliceSize);

  const fileName = (file.name || '').toLowerCase();
  if (fileName.endsWith('.jsonl') || fileName.endsWith('.json')) {
    return parseJsonSnippet(fileSlice, file, startTime, maxRows);
  }

  return new Promise((resolve, reject) => {
    const rows = [];
    let detectedDelimiter = ',';
    let headers = [];
    let isTerminated = false;

    const timeoutId = setTimeout(() => {
      if (!isTerminated && rows.length > 0) {
        finalize();
      } else if (!isTerminated) {
        fallbackSyncParse(fileSlice, file, startTime, maxRows, resolve, reject);
      }
    }, 4000);

    const finalize = () => {
      if (isTerminated) return;
      isTerminated = true;
      clearTimeout(timeoutId);

      const endTime = performance.now();
      const parseDurationMs = Math.round(endTime - startTime);

      const bytesUsed = sliceSize;
      const avgBytesPerRow = rows.length > 0 ? (bytesUsed / rows.length) : 80;
      const estimatedTotalRows = rows.length > 0 
        ? Math.max(rows.length, Math.round(file.size / avgBytesPerRow))
        : 0;

      const snippet = rows.slice(0, 5).map(r => JSON.stringify(r)).join('\n');

      resolve({
        fileName: file.name,
        fileSize: file.size,
        headers,
        rows,
        totalPreviewRows: rows.length,
        estimatedTotalRows,
        detectedDelimiter,
        bytesParsed: sliceSize,
        parseDurationMs,
        snippet
      });
    };

    try {
      Papa.parse(fileSlice, {
        worker: true,
        header: true,
        skipEmptyLines: 'greedy',
        dynamicTyping,
        delimiter: delimiter || undefined,
        preview: maxRows,
        step: (results, parser) => {
          if (isTerminated) return;

          if (results.meta && results.meta.fields && headers.length === 0) {
            headers = results.meta.fields.filter(f => f && f.trim().length > 0);
          }

          if (results.meta && results.meta.delimiter) {
            detectedDelimiter = results.meta.delimiter;
          }

          if (results.data && typeof results.data === 'object') {
            rows.push(results.data);
          }

          if (rows.length >= maxRows) {
            try {
              parser.abort();
            } catch {
            }
            finalize();
          }
        },
        complete: (results) => {
          if (isTerminated) return;

          if (rows.length === 0 && results && results.data && results.data.length > 0) {
            headers = (results.meta && results.meta.fields) || Object.keys(results.data[0] || {});
            detectedDelimiter = results.meta?.delimiter || detectedDelimiter;
            rows.push(...results.data.slice(0, maxRows));
          } else if (results.meta && results.meta.fields && headers.length === 0) {
            headers = results.meta.fields;
          }

          finalize();
        },
        error: () => {
          if (isTerminated) return;
          fallbackSyncParse(fileSlice, file, startTime, maxRows, resolve, reject);
        }
      });
    } catch {
      fallbackSyncParse(fileSlice, file, startTime, maxRows, resolve, reject);
    }
  });
}

function fallbackSyncParse(fileSlice, file, startTime, maxRows, resolve, reject) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result || '';
      const parsed = Papa.parse(text, {
        header: true,
        preview: maxRows,
        skipEmptyLines: 'greedy',
        dynamicTyping: true
      });

      const rows = (parsed.data || []).slice(0, maxRows);
      const headers = (parsed.meta && parsed.meta.fields) || (rows[0] ? Object.keys(rows[0]) : []);
      const detectedDelimiter = parsed.meta?.delimiter || ',';

      const endTime = performance.now();
      const avgBytesPerRow = rows.length > 0 ? (text.length / rows.length) : 80;
      const estimatedTotalRows = rows.length > 0 
        ? Math.max(rows.length, Math.round(file.size / avgBytesPerRow))
        : 0;

      resolve({
        fileName: file.name,
        fileSize: file.size,
        headers,
        rows,
        totalPreviewRows: rows.length,
        estimatedTotalRows,
        detectedDelimiter,
        bytesParsed: fileSlice.size,
        parseDurationMs: Math.round(endTime - startTime),
        snippet: rows.slice(0, 5).map(r => JSON.stringify(r)).join('\n')
      });
    } catch (err) {
      reject(new Error(`Failed to parse file slice: ${err.message}`));
    }
  };
  reader.onerror = () => reject(new Error('FileReader error reading slice.'));
  reader.readAsText(fileSlice);
}

async function parseJsonSnippet(fileSlice, file, startTime, maxRows) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result || '';
        const lines = text.split(/\r\n|\n/).filter(l => l.trim().length > 0);
        let rows = [];

        if (text.trim().startsWith('[')) {
          try {
            const arr = JSON.parse(text);
            rows = Array.isArray(arr) ? arr.slice(0, maxRows) : [];
          } catch {
            rows = parseJsonlLines(lines, maxRows);
          }
        } else {
          rows = parseJsonlLines(lines, maxRows);
        }

        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        const avgBytesPerRow = rows.length > 0 ? (text.length / rows.length) : 100;
        const estimatedTotalRows = rows.length > 0
          ? Math.max(rows.length, Math.round(file.size / avgBytesPerRow))
          : 0;

        resolve({
          fileName: file.name,
          fileSize: file.size,
          headers,
          rows,
          totalPreviewRows: rows.length,
          estimatedTotalRows,
          detectedDelimiter: 'JSON',
          bytesParsed: fileSlice.size,
          parseDurationMs: Math.round(performance.now() - startTime),
          snippet: rows.slice(0, 5).map(r => JSON.stringify(r)).join('\n')
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed reading JSON slice'));
    reader.readAsText(fileSlice);
  });
}

function parseJsonlLines(lines, maxRows) {
  const result = [];
  for (const line of lines) {
    if (result.length >= maxRows) break;
    try {
      const obj = JSON.parse(line);
      if (typeof obj === 'object' && obj !== null) {
        result.push(obj);
      }
    } catch {
    }
  }
  return result;
}
