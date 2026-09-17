import React from 'react';
import { Badge } from './Badge';
import { ZapIcon } from './Icons';
import { useFPSMonitor } from '../../hooks/useFPSMonitor';

export function Header() {
  const fps = useFPSMonitor();

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="brand-badge-container">
          <div className="brand-logo-gem">
            <ZapIcon size={22} className="text-cyan" />
          </div>
          <div>
            <div className="brand-title-row">
              <span className="brand-title">StreamWeaver</span>
              <Badge variant="cyan" size="sm">M1 &bull; Day 01</Badge>
            </div>
            <span className="brand-tagline">High-Throughput No-Code ETL Streaming Pipeline</span>
          </div>
        </div>
      </div>

      <div className="header-right">
        <div className="branch-tag" title="Active development branch for Member 1">
          <span className="branch-dot"></span>
          <code>feature/ui-analytics</code>
        </div>

        <div className="fps-counter" title="Real-time DOM rendering performance monitor">
          <span className={`fps-dot ${fps >= 55 ? 'fps-good' : 'fps-warn'}`}></span>
          <span className="fps-value">{fps} FPS</span>
          <span className="fps-label">Zero Lag</span>
        </div>
      </div>
    </header>
  );
}
