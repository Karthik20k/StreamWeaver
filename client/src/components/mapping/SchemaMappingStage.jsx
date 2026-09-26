import React, { useState, useMemo } from 'react';
import '../../styles/mapping.css';

import { MappingHeader } from './MappingHeader';
import { MappingSummaryBar } from './MappingSummaryBar';
import { SourceColumnsPanel } from './SourceColumnsPanel';
import { TargetFieldsPanel } from './TargetFieldsPanel';
import { TransformationDrawer } from './TransformationDrawer';
import { MappingJsonViewerModal } from './MappingJsonViewerModal';
import { useSchemaMapping } from '../../hooks/useSchemaMapping';
import { Button } from '../common/Button';
import { 
  SlidersIcon, 
  CheckCircleIcon, 
  AlertCircleIcon, 
  ArrowRightIcon, 
  DatabaseIcon, 
  CloudUploadIcon 
} from '../common/Icons';

export function SchemaMappingStage({
  file,
  metadata,
  parsedRows = [],
  onBackToPreview,
  onProceedToIngest
}) {
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState({
    isOpen: false,
    sourceColumn: null,
    targetField: null
  });

  // Extract source headers from metadata or preview rows
  const sourceHeaders = useMemo(() => {
    if (metadata?.headers && metadata.headers.length > 0) {
      return metadata.headers;
    }
    if (parsedRows[0]) {
      return Object.keys(parsedRows[0]);
    }
    return [];
  }, [metadata, parsedRows]);

  // Determine smart initial schema based on filename and header names
  const initialSchemaId = useMemo(() => {
    const fn = (file?.name || '').toLowerCase();
    const joinedHeaders = sourceHeaders.join(' ').toLowerCase();

    if (fn.includes('ledger') || joinedHeaders.includes('debit') || joinedHeaders.includes('account_number')) {
      return 'financial_ledger';
    }
    if (fn.includes('user') || joinedHeaders.includes('email') || joinedHeaders.includes('last_name')) {
      return 'user_profiles';
    }
    return 'ecommerce_orders';
  }, [file, sourceHeaders]);

  const {
    schemas,
    selectedSchemaId,
    activeSchema,
    targetFields,
    mappings,
    reverseMappings,
    transformations,
    setSelectedSchemaId,
    setMapping,
    removeMapping,
    removeMappingByTarget,
    clearAllMappings,
    autoMapAll,
    setTransformation,
    resetTransformation,
    getTransformation,
    stats,
    exportConfig
  } = useSchemaMapping({
    sourceHeaders,
    sampleRows: parsedRows,
    initialSchemaId
  });

  const handleOpenRules = (sourceCol) => {
    const tgtName = mappings[sourceCol];
    if (!tgtName) return;
    const targetDef = targetFields.find((f) => f.name === tgtName);
    setActiveDrawer({
      isOpen: true,
      sourceColumn: sourceCol,
      targetField: targetDef || { name: tgtName, type: 'String', required: false }
    });
  };

  const handleCloseDrawer = () => {
    setActiveDrawer({
      isOpen: false,
      sourceColumn: null,
      targetField: null
    });
  };

  const handleProceed = () => {
    const compiledConfig = exportConfig();
    if (onProceedToIngest) {
      onProceedToIngest(compiledConfig);
    }
  };

  return (
    <div className="schema-mapping-stage">
      {/* Stage Toolbar */}
      <MappingHeader
        schemas={schemas}
        selectedSchemaId={selectedSchemaId}
        onSelectSchema={setSelectedSchemaId}
        onAutoMap={autoMapAll}
        onClearMappings={clearAllMappings}
        onOpenJsonModal={() => setIsJsonModalOpen(true)}
        mappedCount={stats.mappedCount}
        totalSource={stats.totalSource}
      />

      {/* Summary KPI Telemetry */}
      <MappingSummaryBar
        stats={stats}
        activeSchema={activeSchema}
      />

      {/* Primary Split-Column Mapping Workspace */}
      <div className="mapping-split-container">
        {/* Left Panel: CSV Source Columns with Drag & Drop and Rule Buttons */}
        <SourceColumnsPanel
          sourceHeaders={sourceHeaders}
          sampleRows={parsedRows}
          mappings={mappings}
          transformations={transformations}
          targetFields={targetFields}
          onSetMapping={setMapping}
          onOpenRules={handleOpenRules}
        />

        {/* Center Connection Pipeline Bridge */}
        <div className="mapping-bridge-column" aria-hidden="true">
          <div className="bridge-pipe-line" />
          <div className="bridge-icon-orb" title="Schema Transform Stream Bridge">
            <SlidersIcon size={20} />
          </div>
          <div className="bridge-pipe-line" />
        </div>

        {/* Right Panel: Target Database Fields with Drop Zones and Rule Buttons */}
        <TargetFieldsPanel
          targetFields={targetFields}
          activeSchema={activeSchema}
          sourceHeaders={sourceHeaders}
          reverseMappings={reverseMappings}
          transformations={transformations}
          onSetMapping={setMapping}
          onRemoveMappingByTarget={removeMappingByTarget}
          onOpenRules={handleOpenRules}
        />
      </div>

      {/* Bottom Sticky Action / Validation Bar */}
      <div className="mapping-footer-bar">
        <div
          className={`footer-status-pill ${stats.isAllRequiredMapped ? 'is-ready' : 'is-incomplete'}`}
        >
          {stats.isAllRequiredMapped ? (
            <>
              <CheckCircleIcon size={18} />
              <span>
                All {stats.requiredCount} required database fields successfully mapped to source columns.
              </span>
            </>
          ) : (
            <>
              <AlertCircleIcon size={18} />
              <span>
                {stats.unmappedRequiredCount} required target field
                {stats.unmappedRequiredCount > 1 ? 's' : ''} unmapped:{' '}
                <strong>
                  {stats.missingRequiredFields.map((f) => f.name).join(', ')}
                </strong>
              </span>
            </>
          )}
        </div>

        <div className="footer-buttons-group">
          <Button
            variant="ghost"
            size="md"
            onClick={onBackToPreview}
          >
            &larr; Back to Preview
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={CloudUploadIcon}
            onClick={handleProceed}
            title={
              stats.isAllRequiredMapped
                ? 'Proceed to Ingestion stream'
                : 'Map all required fields before proceeding'
            }
          >
            Proceed to Ingest &rarr;
          </Button>
        </div>
      </div>

      {/* Transformation Drawer (Slide-Over for Rule Selection) */}
      <TransformationDrawer
        isOpen={activeDrawer.isOpen}
        onClose={handleCloseDrawer}
        sourceColumn={activeDrawer.sourceColumn}
        targetField={activeDrawer.targetField}
        sampleRows={parsedRows}
        currentRules={
          activeDrawer.sourceColumn ? getTransformation(activeDrawer.sourceColumn) : {}
        }
        onSaveRules={setTransformation}
        onResetRules={resetTransformation}
      />

      {/* Active Mapping & Transformations JSON Inspector Modal */}
      <MappingJsonViewerModal
        isOpen={isJsonModalOpen}
        onClose={() => setIsJsonModalOpen(false)}
        mappings={mappings}
        transformations={transformations}
        activeSchema={activeSchema}
        stats={stats}
      />
    </div>
  );
}
