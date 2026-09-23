import React, { useState } from 'react';
import './styles/index.css';
import './styles/dropzone.css';

import { AppLayout } from './components/layout/AppLayout';
import { PipelineStepper } from './components/layout/PipelineStepper';
import { FileDropzone } from './components/dropzone/FileDropzone';
import { FileDetailsCard } from './components/dropzone/FileDetailsCard';
import { SampleDataSelector } from './components/dropzone/SampleDataSelector';
import { UploadConfig } from './components/dropzone/UploadConfig';
import { PreviewStage } from './components/preview/PreviewStage';
import { useFileDrop } from './hooks/useFileDrop';

export default function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [activeSampleId, setActiveSampleId] = useState(null);
  
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
    resetFile();
    setCurrentStep(1);
  };

  return (
    <AppLayout>
      <PipelineStepper
        currentStep={currentStep}
        onStepClick={(stepId) => {
          if (stepId === 1) setCurrentStep(1);
          if (stepId === 2 && file) setCurrentStep(2);
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
        />
      )}
    </AppLayout>
  );
}
