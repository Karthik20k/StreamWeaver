import React, { useState, useMemo } from 'react';
import '../../styles/mapping.css';

import { MappingHeader } from './MappingHeader';
import { MappingSummaryBar } from './MappingSummaryBar';
import { SourceColumnsPanel } from './SourceColumnsPanel';
import { TargetFieldsPanel } from './TargetFieldsPanel';
import { TransformationDrawer } from './TransformationDrawer';
import { AutoMapReportModal } from './AutoMapReportModal';
import { ValidationDrawer } from './ValidationDrawer';
import { MappingJsonViewerModal } from './MappingJsonViewerModal';
import { ScriptEditorModal } from './ScriptEditorModal';
import { useSchemaMapping } from '../../hooks/useSchemaMapping';
import { Button } from '../common/Button';
import { 
  SlidersIcon, 
  CheckCircleIcon, 
  AlertCircleIcon, 
  ArrowRightIcon, 
  DatabaseIcon, 
  CloudUploadIcon,
  SparklesIcon,
  CodeIcon 
} from '../common/Icons';

export function SchemaMappingStage({
  file,
  metadata,
  parsedRows = [],
  onBackToPreview,
  onProceedToIngest
}) {
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [isValidationDrawerOpen, setIsValidationDrawerOpen] = useState(false);
  const [isScriptEditorOpen, setIsScriptEditorOpen] = useState(false);
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
    customScript,
    autoMatchReport,
    validation,
    setSelectedSchemaId,
    setMapping,
    removeMapping,
    removeMappingByTarget,
    resolveDuplicate,
    clearAllMappings,
    autoMapAll,
    clearAutoMatchReport,
    setTransformation,
    resetTransformation,
    getTransformation,
    setCustomScript,
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
    if (!validation.canProceed) {
      setIsValidationDrawerOpen(true);
      return;
    }
    const compiledConfig = exportConfig();
    if (onProceedToIngest) {
      onProceedToIngest(compiledConfig);
    }
  };

  return (
    <div className="schema-mapping-stage">
      {/* Stage Toolbar with Auto-Map action */}
      <MappingHeader
        schemas={schemas}
        selectedSchemaId={selectedSchemaId}
        onSelectSchema={setSelectedSchemaId}
        onAutoMap={() => autoMapAll()}
        onClearMappings={clearAllMappings}
        onOpenJsonModal={() => setIsJsonModalOpen(true)}
        onOpenScriptEditor={() => setIsScriptEditorOpen(true)}
        hasCustomScript={Boolean(customScript?.trim())}
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
        <div className="mapping-bridge-column">
          <div className="bridge-pipe-line" />
          <button 
            type="button"
            className={`bridge-icon-orb ${customScript ? 'has-script' : ''}`}
            onClick={() => setIsScriptEditorOpen(true)}
            title="Open dynamic JavaScript transformation workspace (Monaco Editor)"
            aria-label="Open JavaScript code editor"
          >
            <CodeIcon size={20} className="text-cyan" />
            {customScript && <span className="orb-script-pulse" />}
          </button>
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

      {/* Bottom Sticky Action / Pre-Upload Validation Bar */}
      <div className="mapping-footer-bar">
        <div
          className={`footer-status-pill ${validation.canProceed ? 'is-ready' : 'is-incomplete'}`}
        >
          {validation.canProceed ? (
            <>
              <CheckCircleIcon size={18} />
              <span>
                All {stats.requiredCount} required database fields successfully validated & mapped.
              </span>
            </>
          ) : (
            <>
              <AlertCircleIcon size={18} />
              <span>
                {validation.criticalErrorsCount} validation blocker{validation.criticalErrorsCount > 1 ? 's' : ''}:{' '}
                <strong>
                  {validation.missingRequiredFields.length > 0 &&
                    `${validation.missingRequiredFields.length} required field(s) unmapped`}
                  {validation.duplicateTargetAlerts.length > 0 &&
                    ` · ${validation.duplicateTargetAlerts.length} duplicate collision(s)`}
                </strong>
              </span>
            </>
          )}
        </div>

        <div className="footer-buttons-group">
          {!validation.canProceed && (
            <Button
              variant="outline"
              size="md"
              icon={AlertCircleIcon}
              onClick={() => setIsValidationDrawerOpen(true)}
              title="Inspect blocking validation errors and duplicate mappings"
            >
              Review Issues ({validation.totalErrors})
            </Button>
          )}

          <Button
            variant="ghost"
            size="md"
            onClick={onBackToPreview}
          >
            &larr; Back to Preview
          </Button>

          <Button
            variant={validation.canProceed ? 'primary' : 'secondary'}
            size="md"
            icon={CloudUploadIcon}
            onClick={handleProceed}
            title={
              validation.canProceed
                ? 'Proceed to Ingestion stream'
                : 'Review and resolve required field blockers before proceeding'
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

      {/* Day 3: Auto-Mapping Heuristic Report Modal */}
      <AutoMapReportModal
        isOpen={Boolean(autoMatchReport)}
        onClose={clearAutoMatchReport}
        report={autoMatchReport}
      />

      {/* Day 3: Pre-Upload Validation Audit Drawer */}
      <ValidationDrawer
        isOpen={isValidationDrawerOpen}
        onClose={() => setIsValidationDrawerOpen(false)}
        validation={validation}
        sourceHeaders={sourceHeaders}
        onSetMapping={setMapping}
        onResolveDuplicate={resolveDuplicate}
        onProceedToIngest={handleProceed}
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

      {/* Day 11: In-Browser Script Editor Workspace Modal (Monaco) */}
      <ScriptEditorModal
        isOpen={isScriptEditorOpen}
        onClose={() => setIsScriptEditorOpen(false)}
        initialScript={customScript}
        onSaveScript={setCustomScript}
        sampleRows={parsedRows}
        sourceHeaders={sourceHeaders}
        targetFields={targetFields}
        activeSchema={activeSchema}
      />
    </div>
  );
}
