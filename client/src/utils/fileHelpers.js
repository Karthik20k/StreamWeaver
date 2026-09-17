export function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function estimateChunks(bytes, chunkSize = 64 * 1024) {
  if (!bytes || bytes <= 0) return 1;
  return Math.ceil(bytes / chunkSize);
}

export function validateFileType(file, acceptedExtensions = ['.csv', '.tsv', '.json', '.jsonl', '.txt']) {
  if (!file) return { valid: false, error: 'No file provided' };
  
  const fileName = file.name.toLowerCase();
  const hasValidExt = acceptedExtensions.some(ext => fileName.endsWith(ext));
  
  if (!hasValidExt) {
    return {
      valid: false,
      error: `Unsupported file format. Please upload ${acceptedExtensions.join(', ')} files.`
    };
  }
  
  return { valid: true };
}

// Read first few KB to get headers and detect delimiter without loading full file into memory
export async function readInitialSnippet(file, maxBytes = 8192) {
  return new Promise((resolve, reject) => {
    const slice = file.slice(0, Math.min(file.size, maxBytes));
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target.result || '';
        const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
        
        if (lines.length === 0) {
          return resolve({
            snippet: '',
            detectedDelimiter: ',',
            headers: [],
            estimatedRows: 0
          });
        }

        const firstLine = lines[0];
        
        // Simple delimiter detection
        const commaCount = (firstLine.match(/,/g) || []).length;
        const tabCount = (firstLine.match(/\t/g) || []).length;
        const semiCount = (firstLine.match(/;/g) || []).length;
        const pipeCount = (firstLine.match(/\|/g) || []).length;

        let detectedDelimiter = ',';
        let maxCount = commaCount;
        if (tabCount > maxCount) {
          detectedDelimiter = '\t';
          maxCount = tabCount;
        }
        if (semiCount > maxCount) {
          detectedDelimiter = ';';
          maxCount = semiCount;
        }
        if (pipeCount > maxCount) {
          detectedDelimiter = '|';
        }

        const headers = firstLine
          .split(detectedDelimiter)
          .map(h => h.replace(/^["']|["']$/g, '').trim());

        // Rough estimation based on sampled line length
        const avgLineBytes = text.length / Math.max(lines.length, 1);
        const estimatedRows = avgLineBytes > 0 ? Math.round(file.size / avgLineBytes) : lines.length;

        resolve({
          snippet: lines.slice(0, 5).join('\n'),
          detectedDelimiter,
          headers,
          estimatedRows: Math.max(estimatedRows, lines.length)
        });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file slice.'));
    reader.readAsText(slice);
  });
}
