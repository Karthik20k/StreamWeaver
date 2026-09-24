import React from 'react';
import { Header } from '../common/Header';

export function AppLayout({ children }) {
  return (
    <div className="app-layout">
      <Header />
      <main className="app-main">
        <div className="app-content-container">
          {children}
        </div>
      </main>
      <footer className="app-footer">
        <div className="footer-status-indicator">
          <span className="status-dot"></span>
          <span>StreamWeaver &bull; High-Throughput Stream Pipeline</span>
        </div>
        <div className="footer-tech-stack">
          <span>React</span>
          <span className="divider-bullet">&bull;</span>
          <span>Node.js Streams</span>
          <span className="divider-bullet">&bull;</span>
          <span>MongoDB Bulk</span>
        </div>
      </footer>
    </div>
  );
}
