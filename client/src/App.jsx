import React, { useState } from 'react';
import './styles/index.css';
import './styles/dropzone.css';

import { AppLayout } from './components/layout/AppLayout';
import { PipelineStepper } from './components/layout/PipelineStepper';
import { FileDropzone } from './components/dropzone/FileDropzone';
import { FileDetailsCard } from './components/dropzone/FileDetailsCard';
import { SampleDataSelector } from './components/dropzone/SampleDataSelector';
import { UploadConfig } from './components/dropzone/UploadConfig';
import { PreviewPlaceholder } from './components/preview/PreviewPlaceholder';
import { useFileDrop } from './hooks/useFileDrop';

export default function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [activeSampleId, setActiveSampleId] = useState(null);
  
  // Parser and Streaming configuration
  const [uploadConfig, setUploadConfig] = useState({
    delimiter: 'auto',
    encoding: 'utf-8',
    chunkSize: 65536, // 64 KB
    hasHeader: true
  });

  const {
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
  } = useFileDrop();

  const handleSelectSample = (sampleId) => {
    setActiveSampleId(sampleId);
    loadSampleDataset(sampleId);
  };

  const handleReset = () => {
    setActiveSampleId(null);
    resetFile();
    setCurrentStep(1);
  };

  const handleProceedToPreview = () => {
    setCurrentStep(2);
  };

  return (
    <AppLayout>
      {/* 4-Stage ETL Pipeline Stepper */}
      <PipelineStepper
        currentStep={currentStep}
        onStepClick={(stepId) => {
          if (stepId === 1) setCurrentStep(1);
          if (stepId === 2 && file) setCurrentStep(2);
        }}
      />

      {/* Stage 1: File Ingestion & Dropzone */}
      {currentStep === 1 && (
        <div className="pipeline-stage-content">
          {!file ? (
            <>
              {/* Primary HTML5 Drag-and-Drop Area */}
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

              {/* Parser Configuration Controls */}
              <UploadConfig
                config={uploadConfig}
                onChange={setUploadConfig}
              />

              {/* Preset Sample Datasets for 1-Click Verification */}
              <SampleDataSelector
                onSelectSample={handleSelectSample}
                activeSampleId={activeSampleId}
              />
            </>
          ) : (
            <>
              {/* File Verified & Metadata Inspection Card */}
              <FileDetailsCard
                file={file}
                metadata={fileMetadata}
                onReset={handleReset}
                onProceed={handleProceedToPreview}
              />

              {/* Parser Configuration Controls for verified file */}
              <UploadConfig
                config={uploadConfig}
                onChange={setUploadConfig}
              />
            </>
          )}
        </div>
      )}

      {/* Stage 2: Staged for Virtualized Preview (Day 02) */}
      {currentStep === 2 && (
        <PreviewPlaceholder
          file={file}
          metadata={fileMetadata}
          onBackToUpload={() => setCurrentStep(1)}
        />
      )}
    </AppLayout>
  );
}
