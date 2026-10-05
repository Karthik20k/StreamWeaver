import React, { useState, useEffect } from 'react';
import { 
  XIcon, 
  CodeIcon, 
  CheckIcon, 
  TrashIcon, 
  SparklesIcon, 
  DatabaseIcon, 
  ShieldCheckIcon 
} from '../common/Icons';
import { Button } from '../common/Button';
import { MonacoScriptEditor } from './MonacoScriptEditor';
import { DEFAULT_BOILERPLATE_SCRIPT } from '../../utils/scriptTemplates';

/**
 * ScriptEditorModal
 * Full-screen / expansive modal allowing users to author dynamic JS transformation scripts
 * for the streaming pipeline and isolated-vm sandbox.
 */
export function ScriptEditorModal({
  isOpen,
  onClose,
  initialScript = '',
  onSaveScript,
  sampleRows = [],
  sourceHeaders = [],
  targetFields = [],
  activeSchema
}) {
  const [localCode, setLocalCode] = useState(initialScript || DEFAULT_BOILERPLATE_SCRIPT);

  useEffect(() => {
    if (isOpen) {
      setLocalCode(initialScript || DEFAULT_BOILERPLATE_SCRIPT);
    }
  }, [isOpen, initialScript]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveScript(localCode);
    onClose();
  };

  const handleClear = () => {
    setLocalCode(DEFAULT_BOILERPLATE_SCRIPT);
    onSaveScript('');
  };

  const hasCustomCode = localCode.trim() !== '' && localCode !== DEFAULT_BOILERPLATE_SCRIPT;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div 
        className="modal-panel script-modal-panel" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '1040px', width: '95vw' }}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-orb">
              <CodeIcon size={22} className="text-cyan" />
            </div>
            <div>
              <h3>Dynamic JavaScript Transformation Workspace</h3>
              <p className="modal-subtitle">
                Author custom row-level JS rules pre-compiled in a dedicated 16MB isolated-vm V8 sandbox
              </p>
            </div>
          </div>

          <div className="modal-header-actions">
            <span className="sandbox-secure-badge">
              <ShieldCheckIcon size={14} className="text-emerald" />
              <span>isolated-vm Safe</span>
            </span>
            <button className="search-clear-btn" onClick={onClose} aria-label="Close modal">
              <XIcon size={18} />
            </button>
          </div>
        </div>

        {/* Info Banner */}
        <div className="script-workspace-banner">
          <div className="banner-schema-info">
            <DatabaseIcon size={14} className="text-cyan" />
            <span>Target Collection: <strong>{activeSchema?.targetCollection || 'Active Schema'}</strong></span>
            <span className="divider-dot">•</span>
            <span>{sourceHeaders.length} Source Columns</span>
            <span className="divider-dot">•</span>
            <span>{targetFields.length} Target Fields</span>
          </div>

          <div className="banner-help-tip">
            <span>Tip: The <code>transform(row)</code> function receives raw record objects and must return the transformed object.</span>
          </div>
        </div>

        {/* Embedded Monaco Editor */}
        <div className="script-modal-body">
          <MonacoScriptEditor
            code={localCode}
            onChange={setLocalCode}
            sampleRows={sampleRows}
            sourceColumns={sourceHeaders}
            targetFields={targetFields}
            height="380px"
            showSimulation={true}
          />
        </div>

        {/* Modal Footer Actions */}
        <div className="modal-footer">
          <Button
            variant="ghost"
            size="sm"
            icon={TrashIcon}
            onClick={handleClear}
            title="Reset code to default template"
          >
            Clear / Reset Script
          </Button>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
            >
              Cancel
            </Button>

            <Button
              variant="primary"
              size="sm"
              icon={CheckIcon}
              onClick={handleSave}
            >
              Save & Apply Transform Script
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
