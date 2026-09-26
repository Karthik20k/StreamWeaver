import React, { useState } from 'react';
import './styles/index.css';
import './styles/dropzone.css';
import './styles/mapping.css';

import { AppLayout } from './components/layout/AppLayout';
import { PipelineStepper } from './components/layout/PipelineStepper';
import { FileDropzone } from './components/dropzone/FileDropzone';
import { FileDetailsCard } from './components/dropzone/FileDetailsCard';
import { SampleDataSelector } from './components/dropzone/SampleDataSelector';
import { UploadConfig } from './components/dropzone/UploadConfig';
import { PreviewStage } from './components/preview/PreviewStage';
import { SchemaMappingStage } from './components/mapping/SchemaMappingStage';
import { UploadProgressModal } from './components/preview/UploadProgressModal';
import { Button } from './components/common/Button';
import { Badge } from './components/common/Badge';
import { 
  DatabaseIcon, 
  CloudUploadIcon, 
  SlidersIcon, 
  CheckCircleIcon,
  ZapIcon
} from './components/common/Icons';
import { formatBytes } from './utils/fileHelpers';
import { useFileDrop } from './hooks/useFileDrop';
import { useStreamingUpload } from './hooks/useStreamingUpload';

export default function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [activeSampleId, setActiveSampleId] = useState(null);
  const [mappingConfig, setMappingConfig] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  
  const [uploadConfig, setUploadConfig] = useState({
    delimiter: 'auto',
    encoding: 'utf-8',
    chunkSize: 65536,
    hasHeader: true
  });

  const {
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
    resetFile
  } = useFileDrop({ uploadConfig });

  const uploadState = useStreamingUpload({
    apiEndpoint: '/api/upload/stream'
  });

  const handleSelectSample = (sampleId) => {
    setActiveSampleId(sampleId);
    loadSampleDataset(sampleId);
  };

  const handleReset = () => {
    setActiveSampleId(null);
    setMappingConfig(null);
    resetFile();
    setCurrentStep(1);
  };

  const handleProceedToIngest = (config) => {
    setMappingConfig(config);
    setCurrentStep(4);
  };

  return (
    <AppLayout>
      <PipelineStepper
        currentStep={currentStep}
        onStepClick={(stepId) => {
          if (stepId === 1) setCurrentStep(1);
          if (stepId === 2 && file) setCurrentStep(2);
          if (stepId === 3 && file) setCurrentStep(3);
          if (stepId === 4 && file && mappingConfig) setCurrentStep(4);
        }}
      />

      {currentStep === 1 && (
        <div className="pipeline-stage-content">
          {!file ? (
            <>
              <FileDropzone
                isDragging={isDragging}
                onDragEnter={onDragEnter}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onFileSelect={onFileSelect}
                error={error}
                isAnalyzing={isAnalyzing}
              />

              <UploadConfig
                config={uploadConfig}
                onChange={setUploadConfig}
              />

              <SampleDataSelector
                onSelectSample={handleSelectSample}
                activeSampleId={activeSampleId}
              />
            </>
          ) : (
            <>
              <FileDetailsCard
                file={file}
                metadata={fileMetadata}
                onReset={handleReset}
                onProceed={() => setCurrentStep(2)}
              />

              <UploadConfig
                config={uploadConfig}
                onChange={setUploadConfig}
              />
            </>
          )}
        </div>
      )}

      {currentStep === 2 && (
        <PreviewStage
          file={file}
          metadata={fileMetadata}
          parsedRows={parsedRows}
          onBackToUpload={() => setCurrentStep(1)}
          onProceedToMapping={() => setCurrentStep(3)}
        />
      )}

      {currentStep === 3 && (
        <SchemaMappingStage
          file={file}
          metadata={fileMetadata}
          parsedRows={parsedRows}
          onBackToPreview={() => setCurrentStep(2)}
          onProceedToIngest={handleProceedToIngest}
        />
      )}

      {currentStep === 4 && (
        <div className="schema-mapping-stage">
          <div className="mapping-toolbar-card" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1.5rem' }}>
            <div className="mapping-stage-identity">
              <div className="mapping-icon-square" style={{ borderColor: 'var(--border-glow-emerald)', background: 'rgba(16, 185, 129, 0.1)' }}>
                <DatabaseIcon size={24} className="text-emerald" />
              </div>
              <div className="mapping-title-block">
                <h2>Ready for High-Throughput Streaming Ingestion</h2>
                <p>Schema mapping rules configured. Ready to stream file chunks to backend MongoDB batch buffers.</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', width: '100%' }}>
              <div className="mapping-kpi-item">
                <div className="kpi-icon-wrap cyan">
                  <CloudUploadIcon size={20} />
                </div>
                <div className="kpi-content">
                  <span className="kpi-label">Source File</span>
                  <div className="kpi-value-row">
                    <span className="kpi-val" style={{ fontSize: '1rem' }}>{file?.name}</span>
                  </div>
                  <span className="kpi-sub">{formatBytes(file?.size || 0)}</span>
                </div>
              </div>

              <div className="mapping-kpi-item">
                <div className="kpi-icon-wrap purple">
                  <DatabaseIcon size={20} />
                </div>
                <div className="kpi-content">
                  <span className="kpi-label">Target Collection</span>
                  <div className="kpi-value-row">
                    <span className="kpi-val" style={{ fontSize: '1.1rem' }}>{mappingConfig?.targetCollection || 'ecommerce_orders'}</span>
                  </div>
                  <span className="kpi-sub">Schema: {mappingConfig?.schemaId}</span>
                </div>
              </div>

              <div className="mapping-kpi-item">
                <div className="kpi-icon-wrap emerald">
                  <CheckCircleIcon size={20} />
                </div>
                <div className="kpi-content">
                  <span className="kpi-label">Configured Mappings</span>
                  <div className="kpi-value-row">
                    <span className="kpi-val">{Object.keys(mappingConfig?.mappingRules || {}).length}</span>
                    <span className="kpi-sub">field pairs bound</span>
                  </div>
                  <span className="kpi-sub" style={{ color: 'var(--accent-emerald)' }}>All required fields satisfied</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.25rem' }}>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setCurrentStep(3)}
              >
                &larr; Modify Schema Mapping
              </Button>

              <Button
                variant="primary"
                size="lg"
                icon={CloudUploadIcon}
                onClick={() => setIsUploadOpen(true)}
              >
                Start Ingestion Stream &rarr;
              </Button>
            </div>
          </div>

          <UploadProgressModal
            isOpen={isUploadOpen}
            onClose={() => setIsUploadOpen(false)}
            file={file}
            uploadState={uploadState}
            mappingConfig={mappingConfig}
          />
        </div>
      )}
    </AppLayout>
  );
}
