import { useState, useCallback } from 'react';
import { validateFileType, readInitialSnippet } from '../utils/fileHelpers';
import { createSampleFile } from '../utils/sampleDatasets';

/**
 * Custom hook to handle HTML5 drag-and-drop states, file parsing, and slice previews.
 */
export function useFileDrop(options = {}) {
  const { acceptedExtensions = ['.csv', '.tsv', '.json', '.jsonl'] } = options;

  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [fileMetadata, setFileMetadata] = useState(null);
  const [error, setError] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Process a selected or dropped file
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
      // Memory-safe slice read: reads first few KB only
      const preview = await readInitialSnippet(selectedFile);
      setFileMetadata({
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type || 'text/plain',
        lastModified: selectedFile.lastModified,
        headers: preview.headers,
        detectedDelimiter: preview.detectedDelimiter,
        estimatedRows: preview.estimatedRows,
        snippet: preview.snippet
      });
    } catch (err) {
      setError(`Failed to read file preview: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [acceptedExtensions]);

  // Drag event listeners
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
    // Only set dragging false if leaving the container boundaries
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

  // File browser picker handler
  const onFileSelect = useCallback((e) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      processFile(selectedFiles[0]);
    }
  }, [processFile]);

  // Load sample dataset
  const loadSampleDataset = useCallback((datasetId) => {
    const sampleFile = createSampleFile(datasetId);
    processFile(sampleFile);
  }, [processFile]);

  // Reset file state
  const resetFile = useCallback(() => {
    setFile(null);
    setFileMetadata(null);
    setError(null);
  }, []);

  return {
    isDragging,
    file,
    fileMetadata,
    error,
    isAnalyzing,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onFileSelect,
    loadSampleDataset,
    resetFile
  };
}
