import React from 'react';
import { SAMPLE_DATASETS } from '../../utils/sampleDatasets';
import { FileSpreadsheetIcon, SparklesIcon } from '../common/Icons';
import { Badge } from '../common/Badge';

export function SampleDataSelector({ onSelectSample, activeSampleId }) {
  return (
    <div className="sample-datasets-container">
      <div className="sample-header">
        <div className="sample-title-row">
          <SparklesIcon size={16} className="text-cyan" />
          <h4 className="sample-heading">Quick Test with Demo Datasets</h4>
        </div>
        <span className="sample-subtext">Click any preset to simulate instant file drop and schema analysis</span>
      </div>

      <div className="sample-cards-grid">
        {SAMPLE_DATASETS.map((dataset) => {
          const isSelected = activeSampleId === dataset.id;

          return (
            <div
              key={dataset.id}
              className={`sample-card ${isSelected ? 'is-selected' : ''}`}
              onClick={() => onSelectSample(dataset.id)}
              role="button"
              tabIndex={0}
            >
              <div className="sample-card-header">
                <div className="sample-card-icon">
                  <FileSpreadsheetIcon size={18} />
                </div>
                <Badge variant="cyan" size="sm">{dataset.badge}</Badge>
              </div>

              <div className="sample-card-body">
                <span className="sample-dataset-name">{dataset.name}</span>
                <p className="sample-dataset-desc">{dataset.description}</p>
              </div>

              <div className="sample-card-footer">
                <span className="sample-size">{dataset.fileSizeStr}</span>
                <span className="sample-rows">{dataset.estimatedRows.toLocaleString()} rows</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
