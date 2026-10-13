import React, { useState } from 'react';
import './styles/index.css';
import './styles/dropzone.css';
<<<<<<< HEAD
=======
import './styles/mapping.css';
import './styles/ingestion.css';
>>>>>>> main

import { AppLayout } from './components/layout/AppLayout';
import { PipelineStepper } from './components/layout/PipelineStepper';
import { FileDropzone } from './components/dropzone/FileDropzone';
import { FileDetailsCard } from './components/dropzone/FileDetailsCard';
import { SampleDataSelector } from './components/dropzone/SampleDataSelector';
import { UploadConfig } from './components/dropzone/UploadConfig';
import { PreviewStage } from './components/preview/PreviewStage';
<<<<<<< HEAD
=======
import { SchemaMappingStage } from './components/mapping/SchemaMappingStage';
import { IngestionDashboardStage } from './components/ingestion/IngestionDashboardStage';
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
>>>>>>> main
import { useFileDrop } from './hooks/useFileDrop';

export default function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [activeSampleId, setActiveSampleId] = useState(null);
<<<<<<< HEAD
=======
  const [mappingConfig, setMappingConfig] = useState(null);
>>>>>>> main
  
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

  const handleSelectSample = (sampleId) => {
    setActiveSampleId(sampleId);
    loadSampleDataset(sampleId);
  };

  const handleReset = () => {
    setActiveSampleId(null);
<<<<<<< HEAD
=======
    setMappingConfig(null);
>>>>>>> main
    resetFile();
    setCurrentStep(1);
  };

<<<<<<< HEAD
=======
  const handleProceedToIngest = (config) => {
    setMappingConfig(config);
    setCurrentStep(4);
  };

>>>>>>> main
  return (
    <AppLayout>
      <PipelineStepper
        currentStep={currentStep}
        onStepClick={(stepId) => {
          if (stepId === 1) setCurrentStep(1);
          if (stepId === 2 && file) setCurrentStep(2);
<<<<<<< HEAD
=======
          if (stepId === 3 && file) setCurrentStep(3);
          if (stepId === 4 && file && mappingConfig) setCurrentStep(4);
>>>>>>> main
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
<<<<<<< HEAD
=======
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
        <IngestionDashboardStage
          file={file}
          mappingConfig={mappingConfig}
          metadata={fileMetadata}
          onBackToMapping={() => setCurrentStep(3)}
          onProceedToAudit={(jobId) => {
            console.log('Proceeding to DLQ audit for job:', jobId);
          }}
>>>>>>> main
        />
      )}
    </AppLayout>
  );
}
