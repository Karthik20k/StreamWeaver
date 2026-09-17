import React from 'react';
import { CloudUploadIcon, LayersIcon, SlidersIcon, DatabaseIcon } from '../common/Icons';

export function PipelineStepper({ currentStep = 1, onStepClick }) {
  const steps = [
    {
      id: 1,
      name: 'Ingestion & Dropzone',
      subtitle: 'Day 01',
      icon: CloudUploadIcon,
      status: 'active',
      desc: 'Multipart File Intake'
    },
    {
      id: 2,
      name: 'Virtualized Preview',
      subtitle: 'Day 02–03',
      icon: LayersIcon,
      status: currentStep >= 2 ? 'active' : 'upcoming',
      desc: '1k–100k Virtualized Rows'
    },
    {
      id: 3,
      name: 'Schema Mapping',
      subtitle: 'Day 04–06',
      icon: SlidersIcon,
      status: currentStep >= 3 ? 'active' : 'upcoming',
      desc: 'Source → MongoDB Fields'
    },
    {
      id: 4,
      name: 'Stream Execution',
      subtitle: 'Day 08–15',
      icon: DatabaseIcon,
      status: currentStep >= 4 ? 'active' : 'upcoming',
      desc: 'Bulk Pipeline & Telemetry'
    }
  ];

  return (
    <nav className="pipeline-stepper" aria-label="ETL Pipeline Stages">
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
                    <span className="stepper-subtitle">{step.subtitle}</span>
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
