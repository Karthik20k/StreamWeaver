import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { 
  CodeIcon, 
  SunIcon, 
  MoonIcon, 
  SparklesIcon, 
  AlertCircleIcon, 
  CheckCircleIcon, 
  PlayIcon, 
  RefreshCwIcon, 
  CopyIcon,
  TrashIcon,
  ArrowRightIcon
} from '../common/Icons';
import { Button } from '../common/Button';
import { 
  DEFAULT_BOILERPLATE_SCRIPT, 
  SCRIPT_TEMPLATES, 
  validateScriptSyntax, 
  simulateScriptExecution 
} from '../../utils/scriptTemplates';

/**
 * MonacoScriptEditor
 * Embeds Monaco Editor for writing high-throughput JavaScript transformations
 * Executed in Dev 1's isolated-vm (V8 Sandbox)
 */
export function MonacoScriptEditor({
  code = DEFAULT_BOILERPLATE_SCRIPT,
  onChange,
  sampleRows = [],
  sourceColumns = [],
  targetFields = [],
  height = '360px',
  showSimulation = true,
  className = ''
}) {
  const [theme, setTheme] = useState('vs-dark');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [syntaxStatus, setSyntaxStatus] = useState({ isValid: true, error: null, line: null });
  const [simResult, setSimResult] = useState(null);
  const [isCopied, setIsCopied] = useState(false);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  // Validate syntax whenever code updates
  useEffect(() => {
    const status = validateScriptSyntax(code);
    setSyntaxStatus(status);

    // If Monaco is loaded, update editor markers
    if (editorRef.current && monacoRef.current) {
      const monaco = monacoRef.current;
      const model = editorRef.current.getModel();
      if (model) {
        if (!status.isValid && status.line) {
          monaco.editor.setModelMarkers(model, 'streamweaver-syntax', [
            {
              startLineNumber: status.line,
              startColumn: status.column || 1,
              endLineNumber: status.line,
              endColumn: 100,
              message: status.error || 'Syntax error',
              severity: monaco.MarkerSeverity.Error
            }
          ]);
        } else {
          monaco.editor.setModelMarkers(model, 'streamweaver-syntax', []);
        }
      }
    }
  }, [code]);

  // Selected sample row for live simulation
  const currentSampleRow = useMemo(() => {
    if (!sampleRows || sampleRows.length === 0) {
      return { email: 'User.Testing@EXAMPLE.COM', quantity: '5', unit_price: '$49.99', status: 'pending' };
    }
    return sampleRows[selectedRowIndex] || sampleRows[0];
  }, [sampleRows, selectedRowIndex]);

  // Execute simulation against current sample row
  const runSimulation = useCallback(() => {
    if (!currentSampleRow) return;
    const res = simulateScriptExecution(code, currentSampleRow);
    setSimResult(res);
  }, [code, currentSampleRow]);

  // Auto-run simulation when sample row or code changes (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      runSimulation();
    }, 200);
    return () => clearTimeout(t);
  }, [runSimulation]);

  // Configure Monaco Editor upon mount
  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Configure JavaScript compiler options for syntax validation
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false
    });

    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTextFiles: false,
      checkJs: true
    });

    // Provide autocomplete suggestions for source columns and target fields
    const suggestions = [
      ...sourceColumns.map((col) => ({
        label: `row.${col}`,
        kind: monaco.languages.CompletionItemKind.Field,
        insertText: `row['${col}']`,
        documentation: `CSV Source Column: "${col}"`
      })),
      ...targetFields.map((field) => ({
        label: `row.${field.name}`,
        kind: monaco.languages.CompletionItemKind.Property,
        insertText: `row.${field.name}`,
        documentation: `Target Schema Field: ${field.name} (${field.type})`
      }))
    ];

    if (suggestions.length > 0) {
      monaco.languages.registerCompletionItemProvider('javascript', {
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          };
          return {
            suggestions: suggestions.map((s) => ({ ...s, range }))
          };
        }
      });
    }

    editor.focus();
  };

  const handleTemplateChange = (e) => {
    const tId = e.target.value;
    setSelectedTemplateId(tId);
    if (!tId) return;

    const template = SCRIPT_TEMPLATES.find((t) => t.id === tId);
    if (template) {
      onChange(template.code);
    }
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'vs-dark' ? 'light' : 'vs-dark'));
  };

  const handleFormatCode = () => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument')?.run();
    }
  };

  const handleResetToDefault = () => {
    onChange(DEFAULT_BOILERPLATE_SCRIPT);
    setSelectedTemplateId('');
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className={`monaco-script-editor-wrapper ${theme} ${className}`}>
      {/* --------------------------------------------------------------------
          1. Editor Toolbar Controls
          -------------------------------------------------------------------- */}
      <div className="script-editor-toolbar">
        <div className="toolbar-left-group">
          <div className="editor-lang-badge">
            <CodeIcon size={16} className="text-cyan" />
            <span>JavaScript (V8 Sandbox)</span>
          </div>

          {/* Boilerplate Templates Dropdown */}
          <div className="template-picker-group">
            <label htmlFor="script-template-select">Template:</label>
            <select
              id="script-template-select"
              className="script-template-dropdown"
              value={selectedTemplateId}
              onChange={handleTemplateChange}
            >
              <option value="">-- Load Boilerplate Template --</option>
              {SCRIPT_TEMPLATES.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>
                  {tmpl.category}: {tmpl.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="toolbar-right-group">
          {/* In-Editor Syntax Validation Status Pill */}
          <div
            className={`syntax-status-pill ${
              syntaxStatus.isValid ? 'is-valid' : 'is-invalid'
            }`}
            title={syntaxStatus.error || 'Syntax is clean and valid'}
          >
            {syntaxStatus.isValid ? (
              <>
                <CheckCircleIcon size={14} />
                <span>Syntax Valid</span>
              </>
            ) : (
              <>
                <AlertCircleIcon size={14} />
                <span>
                  Error {syntaxStatus.line ? `(Line ${syntaxStatus.line})` : ''}
                </span>
              </>
            )}
          </div>

          {/* Format Document Button */}
          <button
            type="button"
            className="editor-tool-btn"
            onClick={handleFormatCode}
            title="Auto-format JavaScript code (Alt+Shift+F)"
          >
            Format
          </button>

          {/* Copy Script Button */}
          <button
            type="button"
            className="editor-tool-btn"
            onClick={handleCopyCode}
            title="Copy script to clipboard"
          >
            <CopyIcon size={13} />
            <span>{isCopied ? 'Copied!' : 'Copy'}</span>
          </button>

          {/* Reset Code Button */}
          <button
            type="button"
            className="editor-tool-btn"
            onClick={handleResetToDefault}
            title="Reset to default transform boilerplate"
          >
            <RefreshCwIcon size={13} />
            <span>Reset</span>
          </button>

          {/* Light / Dark Theme Toggle */}
          <button
            type="button"
            className="editor-theme-toggle-btn"
            onClick={handleToggleTheme}
            title={`Switch to ${theme === 'vs-dark' ? 'Light' : 'Dark'} Theme`}
          >
            {theme === 'vs-dark' ? (
              <>
                <SunIcon size={14} className="text-amber" />
                <span>Light</span>
              </>
            ) : (
              <>
                <MoonIcon size={14} className="text-cyan" />
                <span>Dark</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------------------
          2. Syntax Error Notification Banner (if syntax invalid)
          -------------------------------------------------------------------- */}
      {!syntaxStatus.isValid && syntaxStatus.error && (
        <div className="syntax-error-banner">
          <AlertCircleIcon size={16} />
          <div className="syntax-error-text">
            <strong>Script Syntax Error:</strong> {syntaxStatus.error}
            {syntaxStatus.line && ` — Check Line ${syntaxStatus.line}`}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------
          3. Monaco Code Editor
          -------------------------------------------------------------------- */}
      <div className="monaco-container-frame">
        <Editor
          height={height}
          language="javascript"
          theme={theme}
          value={code}
          onChange={(newVal) => onChange(newVal || '')}
          onMount={handleEditorDidMount}
          loading={
            <div className="monaco-loading-state">
              <RefreshCwIcon size={20} className="spinning" />
              <span>Loading Monaco V8 Editor...</span>
            </div>
          }
          options={{
            minimap: { enabled: false },
            matchBrackets: 'always',
            autoClosingBrackets: 'always',
            autoClosingQuotes: 'always',
            bracketPairColorization: { enabled: true },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            fontSize: 13,
            fontFamily:
              "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace",
            renderLineHighlight: 'all',
            folding: true,
            cursorBlinking: 'smooth',
            smoothScrolling: true,
            contextmenu: true
          }}
        />
      </div>

      {/* --------------------------------------------------------------------
          4. Live Sandbox Transformation Simulator (Optional / Included)
          -------------------------------------------------------------------- */}
      {showSimulation && (
        <div className="script-simulation-panel">
          <div className="sim-panel-header">
            <div className="sim-panel-title">
              <SparklesIcon size={15} className="text-cyan" />
              <span>Live V8 Sandbox Simulator</span>
              <span className="sandbox-limit-tag">50ms Timeout Guard</span>
            </div>

            <div className="sim-row-selector-group">
              <label htmlFor="sample-row-select">Test Record:</label>
              <select
                id="sample-row-select"
                className="sim-row-select"
                value={selectedRowIndex}
                onChange={(e) => setSelectedRowIndex(Number(e.target.value))}
              >
                {sampleRows.slice(0, 10).map((_, idx) => (
                  <option key={idx} value={idx}>
                    Row #{idx + 1}
                  </option>
                ))}
                {sampleRows.length === 0 && (
                  <option value={0}>Sample Synthetic Record</option>
                )}
              </select>

              <button
                type="button"
                className="sim-run-btn"
                onClick={runSimulation}
                title="Execute transform function on selected record"
              >
                <PlayIcon size={13} />
                <span>Test Run</span>
              </button>
            </div>
          </div>

          <div className="sim-comparison-grid">
            {/* Input Row View */}
            <div className="sim-box sim-input-box">
              <div className="sim-box-header">
                <span>RAW RECORD (INPUT)</span>
              </div>
              <pre className="sim-code-preview">
                {JSON.stringify(currentSampleRow, null, 2)}
              </pre>
            </div>

            {/* Transform Flow Arrow */}
            <div className="sim-arrow-divider">
              <ArrowRightIcon size={18} className="text-cyan" />
              {simResult?.executionTimeMs !== undefined && (
                <span className="sim-latency-tag">
                  {simResult.executionTimeMs}ms
                </span>
              )}
            </div>

            {/* Transformed Record / Exception View */}
            <div
              className={`sim-box sim-output-box ${
                simResult?.success === false ? 'has-error' : ''
              }`}
            >
              <div className="sim-box-header">
                <span>TRANSFORMED RECORD (OUTPUT)</span>
                {simResult?.success ? (
                  <span className="sim-badge success">Success</span>
                ) : (
                  <span className="sim-badge error">Exception</span>
                )}
              </div>
              {simResult?.success ? (
                <pre className="sim-code-preview">
                  {JSON.stringify(simResult.output, null, 2)}
                </pre>
              ) : (
                <div className="sim-error-preview">
                  <AlertCircleIcon size={16} className="text-red" />
                  <code>{simResult?.error || 'Execution failed'}</code>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
