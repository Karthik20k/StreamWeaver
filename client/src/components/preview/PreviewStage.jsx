import React, { useState } from 'react';
import { PreviewToolbar } from './PreviewToolbar';
import { VirtualizedDataGrid } from './VirtualizedDataGrid';
import { BenchmarkModal } from './BenchmarkModal';
import { UploadProgressModal } from './UploadProgressModal';
import { useStreamingUpload } from '../../hooks/useStreamingUpload';
import '../../styles/grid.css';

export function PreviewStage({
  file,
  metadata,
  parsedRows = [],
  onBackToUpload
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const uploadState = useStreamingUpload({
    apiEndpoint: '/api/upload/stream'
  });

  const headers = metadata?.headers || (parsedRows[0] ? Object.keys(parsedRows[0]) : []);

  return (
    <div className="preview-stage-container">
      <PreviewToolbar
        file={file}
        metadata={metadata}
        totalPreviewRows={parsedRows.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenBenchmark={() => setIsBenchmarkOpen(true)}
        onOpenUpload={() => setIsUploadOpen(true)}
        onBackToUpload={onBackToUpload}
      />

      <VirtualizedDataGrid
        headers={headers}
        rows={parsedRows}
        searchQuery={searchQuery}
        estimatedTotalRows={metadata?.estimatedRows || 0}
      />

      <BenchmarkModal
        isOpen={isBenchmarkOpen}
        onClose={() => setIsBenchmarkOpen(false)}
      />

      <UploadProgressModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        file={file}
        uploadState={uploadState}
      />
    </div>
  );
}
