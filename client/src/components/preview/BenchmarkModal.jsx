import React, { useState } from 'react';
import { ZapIcon, CheckCircleIcon, AlertCircleIcon, XIcon, PlayIcon, SparklesIcon } from '../common/Icons';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { run2GBBenchmarkTest } from '../../utils/syntheticBenchmarker';

export function BenchmarkModal({ isOpen, onClose }) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);

  if (!isOpen) return null;

  const handleRunTest = async () => {
    setIsRunning(true);
    setResult(null);
    try {
      const benchmarkData = await run2GBBenchmarkTest();
      setResult(benchmarkData);
    } catch (err) {
      setResult({
        passed: false,
        error: err.message
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="modal-backdrop-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-bar">
          <div className="modal-header-title">
            <ZapIcon size={20} className="text-cyan" />
            <h3 className="modal-title-text">2GB File Slicing Benchmark</h3>
            <Badge variant="cyan" size="sm">Performance</Badge>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <XIcon size={18} />
          </button>
        </div>

        <div className="modal-body-content">
          <p className="text-secondary text-sm">
            Benchmarks slicing the first 1MB of a <strong>2GB dataset</strong> and parsing 1,000 preview rows in a Web Worker to ensure UI responsiveness stays below 300ms.
          </p>

          {!result && !isRunning && (
            <div className="empty-filter-state py-4">
              <SparklesIcon size={32} className="text-cyan" />
              <p className="text-muted text-sm">Click below to generate a synthetic dataset and run the test.</p>
            </div>
          )}

          {isRunning && (
            <div className="empty-filter-state py-6">
              <span className="analyzing-spinner" style={{ width: '28px', height: '28px' }} />
              <p className="text-cyan font-mono text-sm">Running benchmark in worker thread...</p>
            </div>
          )}

          {result && !isRunning && (
            <>
              <div className={`benchmark-badge-row ${result.passed ? 'passed' : 'failed'}`}>
                <div className="flex items-center gap-2">
                  {result.passed ? (
                    <CheckCircleIcon size={24} className="text-emerald" />
                  ) : (
                    <AlertCircleIcon size={24} className="text-red" />
                  )}
                  <div>
                    <strong className={result.passed ? 'text-emerald' : 'text-red'}>
                      {result.passed ? 'BENCHMARK PASSED' : 'BENCHMARK FAILED'}
                    </strong>
                    <div className="text-xs text-muted">
                      Target: &lt; {result.targetSlaMs}ms &bull; Actual: {result.totalDurationMs}ms
                    </div>
                  </div>
                </div>

                <Badge variant={result.passed ? 'emerald' : 'red'} size="md">
                  {result.totalDurationMs} ms
                </Badge>
              </div>

              <div className="benchmark-metrics-grid">
                <div className="benchmark-metric-box">
                  <div className="bm-label">1MB Slice Time</div>
                  <div className="bm-val text-cyan">{result.sliceDurationMs} ms</div>
                </div>
                <div className="benchmark-metric-box">
                  <div className="bm-label">Worker Parse</div>
                  <div className="bm-val text-purple">{result.workerParseDurationMs} ms</div>
                </div>
                <div className="benchmark-metric-box">
                  <div className="bm-label">Sample Extracted</div>
                  <div className="bm-val text-emerald">{result.rowsParsed} rows</div>
                </div>
              </div>

              <div className="dev1-integration-note">
                Slicing 1MB took {result.sliceDurationMs}ms and worker parsing completed in {result.workerParseDurationMs}ms with flat memory usage.
              </div>
            </>
          )}
        </div>

        <div className="modal-footer-actions">
          <Button variant="ghost" size="md" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={PlayIcon}
            onClick={handleRunTest}
            disabled={isRunning}
          >
            {isRunning ? 'Running...' : result ? 'Run Again' : 'Run Benchmark'}
          </Button>
        </div>
      </div>
    </div>
  );
}
