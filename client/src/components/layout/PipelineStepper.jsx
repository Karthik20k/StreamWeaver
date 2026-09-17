import React from 'react';
import { CloudUploadIcon, LayersIcon, SlidersIcon, DatabaseIcon } from '../common/Icons';

export function PipelineStepper({ currentStep = 1, onStepClick }) {
  const steps = [
    {
      id: 1,
      name: 'Upload File',
      stepNum: 'Step 1',
      icon: CloudUploadIcon,
      desc: 'Source CSV, TSV, or JSON'
    },
    {
      id: 2,
      name: 'Data Preview',
      stepNum: 'Step 2',
      icon: LayersIcon,
      desc: 'Virtualized table grid'
    },
    {
      id: 3,
      name: 'Schema Mapping',
      stepNum: 'Step 3',
      icon: SlidersIcon,
      desc: 'Field rules & transforms'
    },
    {
      id: 4,
      name: 'Run Ingest',
      stepNum: 'Step 4',
      icon: DatabaseIcon,
      desc: 'Stream to MongoDB'
    }
  ];

  return (
    <nav className="pipeline-stepper" aria-label="Pipeline Stages">
      <div className="stepper-track">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const isCompleted = currentStep > step.id;
          const isClickable = onStepClick && (isCompleted || isActive);

          return (
            <React.Fragment key={step.id}>
              <div
                className={`stepper-item ${isActive ? 'is-active' : ''} ${isCompleted ? 'is-completed' : ''} ${isClickable ? 'is-clickable' : ''}`}
                onClick={() => isClickable && onStepClick(step.id)}
                role="button"
                tabIndex={isClickable ? 0 : -1}
              >
                <div className="stepper-node">
                  <Icon size={18} />
                </div>
                <div className="stepper-content">
                  <div className="stepper-header-line">
                    <span className="stepper-name">{step.name}</span>
                    <span className="stepper-subtitle">{step.stepNum}</span>
                  </div>
                  <span className="stepper-desc">{step.desc}</span>
                </div>
              </div>

              {idx < steps.length - 1 && (
                <div className={`stepper-divider ${currentStep > step.id ? 'is-completed' : ''}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
}
