import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import { 
  ActivityIcon, 
  ZapIcon, 
  PlayIcon, 
  RefreshCwIcon, 
  TrendingUpIcon 
} from '../common/Icons';

/**
 * Custom Cyber-Aesthetic Tooltip for Live Ingestion Telemetry
 */
function CustomTelemetryTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="telemetry-chart-tooltip">
        <div className="tooltip-header">
          <span className="tooltip-time">{label || data.time}</span>
          <span className="tooltip-fps-tag">60 FPS</span>
        </div>
        <div className="tooltip-metrics">
          <div className="tooltip-metric-row">
            <span className="tooltip-metric-dot cyan" />
            <span className="tooltip-metric-name">Velocity:</span>
            <strong className="tooltip-metric-val text-cyan">
              {data.rate?.toLocaleString()} rows/s
            </strong>
          </div>
          {data.memoryMB !== undefined && (
            <div className="tooltip-metric-row">
              <span className="tooltip-metric-dot purple" />
              <span className="tooltip-metric-name">Heap RAM:</span>
              <strong className="tooltip-metric-val text-purple">
                {data.memoryMB} MB
              </strong>
            </div>
          )}
          {data.latencyMs !== undefined && (
            <div className="tooltip-metric-row">
              <span className="tooltip-metric-dot emerald" />
              <span className="tooltip-metric-name">Latency:</span>
              <strong className="tooltip-metric-val text-emerald">
                {data.latencyMs} ms
              </strong>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
}

/**
 * TelemetrySpeedChart
 * Lightweight, high-frequency real-time line chart plotting ingestion speed (rows/sec) over time
 * Optimized for 60 FPS streaming updates via recharts
 * Dev 3 Day 13 Deliverable
 */
export function TelemetrySpeedChart({
  telemetryHistory = [],
  wsStatus = 'connected',
  onReconnect = null,
  isLive = true,
  onToggleLive = null,
  className = ''
}) {
  const [activeMetricView, setActiveMetricView] = useState('rate'); // 'rate' | 'dual'

  // Synthesize sample fallback history if stream is just beginning
  const chartData = useMemo(() => {
    if (telemetryHistory && telemetryHistory.length > 0) {
      return telemetryHistory;
    }
    // Initial placeholder timeline
    const placeholders = [];
    const now = Date.now();
    for (let i = 15; i >= 0; i--) {
      const t = new Date(now - i * 1000);
      placeholders.push({
        time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        rate: 0,
        memoryMB: 35.0,
        latencyMs: 0.1
      });
    }
    return placeholders;
  }, [telemetryHistory]);

  // Real-time statistics across the sliding window
  const chartStats = useMemo(() => {
    if (chartData.length === 0) {
      return { current: 0, peak: 0, avg: 0 };
    }
    let sum = 0;
    let peak = 0;
    for (const pt of chartData) {
      sum += pt.rate || 0;
      if ((pt.rate || 0) > peak) peak = pt.rate;
    }
    const current = chartData[chartData.length - 1]?.rate || 0;
    const avg = Math.round(sum / chartData.length);
    return { current, peak, avg };
  }, [chartData]);

  // Calculate dynamic Y-axis maximum
  const yAxisMax = useMemo(() => {
    const maxVal = Math.max(chartStats.peak, 10000);
    return Math.ceil(maxVal * 1.15 / 1000) * 1000;
  }, [chartStats.peak]);

  return (
    <div className={`telemetry-speed-chart-card ${className}`}>
      {/* --------------------------------------------------------------------
          1. Chart Header Toolbar & Telemetry KPIs
          -------------------------------------------------------------------- */}
      <div className="chart-header-toolbar">
        <div className="chart-identity-block">
          <div className="chart-icon-square">
            <ZapIcon size={18} className="text-cyan" />
          </div>
          <div>
            <div className="chart-title-row">
              <h3>Real-Time Ingestion Velocity Stream</h3>
              <span className="fps-badge">60 FPS Live</span>
            </div>
            <p className="chart-subtitle">
              Live time-series plot of processed records/sec via WebSocket telemetry bus
            </p>
          </div>
        </div>

        {/* Right Controls: WebSocket Beacon, Metric Toggle, Live Toggle */}
        <div className="chart-controls-group">
          {/* WebSocket Connection State Beacon */}
          <div className={`ws-status-beacon-pill is-${wsStatus}`}>
            <span className="beacon-indicator-dot" />
            <span>
              {wsStatus === 'connected' ? 'WS CONNECTED' :
               wsStatus === 'reconnecting' ? 'WS RECONNECTING' :
               wsStatus === 'connecting' ? 'WS CONNECTING' : 'WS OFFLINE'}
            </span>
          </div>

          {/* Metric View Switcher */}
          <div className="chart-view-toggle">
            <button
              type="button"
              className={`view-toggle-btn ${activeMetricView === 'rate' ? 'active' : ''}`}
              onClick={() => setActiveMetricView('rate')}
            >
              Velocity (r/s)
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${activeMetricView === 'dual' ? 'active' : ''}`}
              onClick={() => setActiveMetricView('dual')}
            >
              Dual: Speed & RAM
            </button>
          </div>

          {/* Live Stream Pause / Resume Button */}
          {onToggleLive && (
            <button
              type="button"
              className={`live-toggle-btn ${isLive ? 'is-live' : 'is-paused'}`}
              onClick={onToggleLive}
              title={isLive ? 'Pause live chart stream' : 'Resume live 60 FPS stream'}
            >
              {isLive ? (
                <>
                  <span className="live-pulse-dot" />
                  <span>Live Feed</span>
                </>
              ) : (
                <>
                  <PlayIcon size={12} />
                  <span>Resume</span>
                </>
              )}
            </button>
          )}

          {/* Manual Reconnect Button (if error / offline) */}
          {(wsStatus === 'error' || wsStatus === 'disconnected') && onReconnect && (
            <button
              type="button"
              className="chart-reconnect-btn"
              onClick={onReconnect}
              title="Reconnect to WebSocket Telemetry"
            >
              <RefreshCwIcon size={13} />
              <span>Reconnect</span>
            </button>
          )}
        </div>
      </div>

      {/* --------------------------------------------------------------------
          2. Live Statistical Ticker Strip
          -------------------------------------------------------------------- */}
      <div className="chart-stats-ticker-strip">
        <div className="ticker-item">
          <span className="ticker-label">CURRENT VELOCITY</span>
          <span className="ticker-value text-cyan">
            {chartStats.current.toLocaleString()} <small>rows/s</small>
          </span>
        </div>

        <div className="ticker-item">
          <span className="ticker-label">WINDOW AVERAGE</span>
          <span className="ticker-value text-emerald">
            {chartStats.avg.toLocaleString()} <small>rows/s</small>
          </span>
        </div>

        <div className="ticker-item">
          <span className="ticker-label">PEAK SPEED</span>
          <span className="ticker-value text-amber">
            {chartStats.peak.toLocaleString()} <small>rows/s</small>
          </span>
        </div>

        <div className="ticker-item">
          <span className="ticker-label">STREAM WINDOW</span>
          <span className="ticker-value text-muted">
            Last {chartData.length} sec
          </span>
        </div>
      </div>

      {/* --------------------------------------------------------------------
          3. Recharts Real-Time Area / Line Chart
          -------------------------------------------------------------------- */}
      <div className="recharts-render-container" style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 15, right: 20, left: 10, bottom: 5 }}
          >
            <defs>
              {/* Velocity Neon Cyan Area Fill Gradient */}
              <linearGradient id="velocityAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.35} />
                <stop offset="60%" stopColor="#10b981" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.0} />
              </linearGradient>

              {/* Memory Area Fill Gradient */}
              <linearGradient id="memoryAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            {/* Subtle Grid Lines */}
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255, 255, 255, 0.05)"
              vertical={false}
            />

            {/* X-Axis: Time Ticker */}
            <XAxis
              dataKey="time"
              stroke="rgba(255, 255, 255, 0.25)"
              tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              tickLine={{ stroke: 'rgba(255, 255, 255, 0.1)' }}
              interval="preserveStartEnd"
              minTickGap={35}
            />

            {/* Y-Axis Primary: Rows / Sec */}
            <YAxis
              yAxisId="velocityAxis"
              domain={[0, yAxisMax]}
              stroke="rgba(255, 255, 255, 0.25)"
              tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              tickLine={{ stroke: 'rgba(255, 255, 255, 0.1)' }}
              tickFormatter={(v) => `${Math.round(v / 1000)}k`}
              width={42}
            />

            {/* Y-Axis Secondary: RAM (MB) for Dual View */}
            {activeMetricView === 'dual' && (
              <YAxis
                yAxisId="memoryAxis"
                orientation="right"
                domain={[0, 150]}
                stroke="rgba(139, 92, 246, 0.4)"
                tick={{ fill: '#a855f7', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                tickFormatter={(v) => `${v}M`}
                width={38}
              />
            )}

            {/* Live Tooltip */}
            <Tooltip content={<CustomTelemetryTooltip />} />

            {/* Average Velocity Reference Line */}
            {chartStats.avg > 0 && (
              <ReferenceLine
                yAxisId="velocityAxis"
                y={chartStats.avg}
                stroke="#10b981"
                strokeDasharray="4 4"
                strokeOpacity={0.7}
                label={{
                  value: `AVG: ${chartStats.avg.toLocaleString()} r/s`,
                  fill: '#10b981',
                  fontSize: 10,
                  position: 'insideTopRight',
                  fontFamily: 'var(--font-mono)'
                }}
              />
            )}

            {/* Primary Speed Stream Area (isAnimationActive=false for 60 FPS performance) */}
            <Area
              yAxisId="velocityAxis"
              type="monotone"
              dataKey="rate"
              name="Velocity"
              stroke="#06b6d4"
              strokeWidth={2.5}
              fill="url(#velocityAreaGradient)"
              isAnimationActive={false}
              dot={false}
              activeDot={{
                r: 5,
                fill: '#06b6d4',
                stroke: '#ffffff',
                strokeWidth: 2
              }}
            />

            {/* Secondary Memory Area (Dual View) */}
            {activeMetricView === 'dual' && (
              <Area
                yAxisId="memoryAxis"
                type="monotone"
                dataKey="memoryMB"
                name="Memory"
                stroke="#8b5cf6"
                strokeWidth={1.8}
                fill="url(#memoryAreaGradient)"
                isAnimationActive={false}
                dot={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
