'use strict';

const EventEmitter = require('node:events');

/**
 * Standard event names emitted by dbEventBus
 */
const EVENTS = {
  WRITE_METRICS: 'db:write:metrics',
  BATCH_COMMITTED: 'db:batch:committed',
  JOB_PROGRESS: 'db:job:progress',
  SCHEMA_REJECTED: 'db:schema:rejected',
  DLQ_COMMITTED: 'db:dlq:committed'
};

/**
 * DbEventBus:
 * High-performance internal event bus for database write metrics and pipeline telemetry.
 * Connects high-throughput MongoDB ingestion sinks with WebSocket servers (Socket.IO / ws)
 * for real-time frontend broadcasting without coupling the write stream to networking layers.
 */
class DbEventBus extends EventEmitter {
  constructor() {
    super();
    // Allow high number of listeners across concurrent ingestion pipelines
    this.setMaxListeners(100);
    // In-memory ring buffer of recent metrics keyed by jobId for fast bootstrapping
    this._recentMetricsByJob = new Map();
    this._maxRecentPerJob = 20;
    this._webSocketServer = null;
  }

  /**
   * Forward database write metrics to the event bus.
   * Broadcasts to local event listeners and attached WebSocket clients.
   *
   * @param {object} metrics
   * @param {string} metrics.jobId
   * @param {string} metrics.fileId
   * @param {number} metrics.batchNumber
   * @param {number} metrics.batchSize
   * @param {number} metrics.writeDurationMs
   * @param {number} metrics.dbIoLatencyMs
   * @param {number} metrics.cumulativeDocumentsCommitted
   */
  publishWriteMetrics(metrics) {
    if (!metrics) return;

    const payload = {
      ...metrics,
      timestamp: metrics.timestamp || new Date().toISOString()
    };

    // Cache in recent metrics ring buffer
    if (payload.jobId) {
      if (!this._recentMetricsByJob.has(payload.jobId)) {
        this._recentMetricsByJob.set(payload.jobId, []);
      }
      const queue = this._recentMetricsByJob.get(payload.jobId);
      queue.push(payload);
      if (queue.length > this._maxRecentPerJob) {
        queue.shift();
      }
    }

    // Emit event bus channels
    this.emit(EVENTS.WRITE_METRICS, payload);
    this.emit(`job:${payload.jobId}:metrics`, payload);

    // Forward to WebSocket server if connected
    this._broadcastToWebSocket('db:write:metrics', payload);
  }

  /**
   * Subscribe to database write metrics.
   *
   * @param {function} listener - Callback (metrics) => void
   * @returns {function} Unsubscribe function
   */
  onWriteMetrics(listener) {
    this.on(EVENTS.WRITE_METRICS, listener);
    return () => this.off(EVENTS.WRITE_METRICS, listener);
  }

  /**
   * Subscribe to job-specific write metrics.
   *
   * @param {string} jobId
   * @param {function} listener
   * @returns {function} Unsubscribe function
   */
  onJobMetrics(jobId, listener) {
    const channel = `job:${jobId}:metrics`;
    this.on(channel, listener);
    return () => this.off(channel, listener);
  }

  /**
   * Attach a WebSocket or Socket.IO server to automatically broadcast database metrics.
   *
   * @param {object} wsServerOrIo - Socket.IO instance or WebSocket server
   */
  attachWebSocketServer(wsServerOrIo) {
    this._webSocketServer = wsServerOrIo;
  }

  /**
   * Internal helper to broadcast to WebSocket / Socket.IO clients
   */
  _broadcastToWebSocket(eventName, data) {
    if (!this._webSocketServer) return;

    try {
      // 1. Socket.IO instance support
      if (typeof this._webSocketServer.emit === 'function') {
        if (data.jobId) {
          // Broadcast to room for specific job if room exists, plus global channel
          if (typeof this._webSocketServer.to === 'function') {
            this._webSocketServer.to(`job:${data.jobId}`).emit(eventName, data);
          }
        }
        this._webSocketServer.emit(eventName, data);
        return;
      }

      // 2. ws WebSocketServer instance (clients Set)
      if (this._webSocketServer.clients && typeof this._webSocketServer.clients.forEach === 'function') {
        const msg = JSON.stringify({ event: eventName, data });
        this._webSocketServer.clients.forEach(client => {
          if (client.readyState === 1 /* OPEN */) {
            client.send(msg);
          }
        });
      }
    } catch (err) {
      console.warn(`[DbEventBus] Warning broadcasting to WebSocket: ${err.message}`);
    }
  }

  /**
   * Retrieve recent metrics for a job.
   *
   * @param {string} jobId
   * @returns {Array<object>}
   */
  getRecentMetrics(jobId) {
    return this._recentMetricsByJob.get(jobId) || [];
  }

  /**
   * Clear cached metrics for a completed/cleaned job.
   *
   * @param {string} jobId
   */
  clearJobMetrics(jobId) {
    this._recentMetricsByJob.delete(jobId);
    this.removeAllListeners(`job:${jobId}:metrics`);
  }
}

// Singleton instance
const dbEventBus = new DbEventBus();

module.exports = dbEventBus;
module.exports.DbEventBus = DbEventBus;
module.exports.dbEventBus = dbEventBus;
module.exports.EVENTS = EVENTS;
