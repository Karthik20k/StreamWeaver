import { useState, useCallback } from 'react';
import { validateFileType } from '../utils/fileHelpers';
import { parseChunkedFile } from '../utils/chunkedCsvParser';
import { createSampleFile } from '../utils/sampleDatasets';

export function useFileDrop(options = {}) {
  const { 
    acceptedExtensions = ['.csv', '.tsv', '.json', '.jsonl', '.txt'],
    uploadConfig = {}
  } = options;

  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [fileMetadata, setFileMetadata] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [error, setError] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const processFile = useCallback(async (selectedFile) => {
    if (!selectedFile) return;

    setError(null);
    const validation = validateFileType(selectedFile, acceptedExtensions);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setFile(selectedFile);
    setIsAnalyzing(true);

    try {
      const result = await parseChunkedFile(selectedFile, {
        maxSliceBytes: 1024 * 1024,
        maxRows: 1000,
        delimiter: uploadConfig.delimiter === 'auto' ? '' : uploadConfig.delimiter
      });

      setParsedRows(result.rows || []);
      setFileMetadata({
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type || 'text/csv',
        lastModified: selectedFile.lastModified,
        headers: result.headers,
        rowsCount: result.rows.length,
        detectedDelimiter: result.detectedDelimiter,
        estimatedRows: result.estimatedTotalRows,
        bytesParsed: result.bytesParsed,
        parseDurationMs: result.parseDurationMs,
        snippet: result.snippet
      });
    } catch (err) {
      setError(`Failed to read file preview: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [acceptedExtensions, uploadConfig.delimiter]);

  const onDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }, [isDragging]);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      processFile(droppedFiles[0]);
    }
  }, [processFile]);

  const onFileSelect = useCallback((e) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      processFile(selectedFiles[0]);
    }
  }, [processFile]);

  const loadSampleDataset = useCallback((datasetId) => {
    const sampleFile = createSampleFile(datasetId);
    processFile(sampleFile);
  }, [processFile]);

  const resetFile = useCallback(() => {
    setFile(null);
    setFileMetadata(null);
    setParsedRows([]);
    setError(null);
  }, []);

  return {
    isDragging,
    file,
    fileMetadata,
    parsedRows,
    error,
    isAnalyzing,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onFileSelect,
    loadSampleDataset,
    resetFile,
    processFile
  };
}
