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
          <span>Sprint Day 01 &bull; Member 1: Frontend &amp; Virtualization &bull; StreamWeaver</span>
        </div>
        <div className="footer-tech-stack">
          <span>React 18</span>
          <span className="divider-bullet">&bull;</span>
          <span>HTML5 Drag &amp; Drop</span>
          <span className="divider-bullet">&bull;</span>
          <span>Vite HMR</span>
          <span className="divider-bullet">&bull;</span>
          <span>60 FPS Target</span>
        </div>
      </footer>
    </div>
  );
}
