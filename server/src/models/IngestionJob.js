const mongoose = require('mongoose');
const crypto = require('node:crypto');

/**
 * IngestionJobSchema:
 * Tracks asynchronous and streaming ingestion job lifecycle, telemetry,
 * row counters, error metrics, and operational metadata.
 */
const IngestionJobSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: [true, 'Job ID is required'],
      unique: true,
      index: true,
      default: () => `job_${crypto.randomUUID()}`
    },
    fileName: {
      type: String,
      required: [true, 'File name is required'],
      trim: true
    },
    status: {
      type: String,
      required: [true, 'Job status is required'],
      enum: {
        values: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
        message: '{VALUE} is not a valid ingestion status.'
      },
      default: 'pending',
      index: true
    },
    totalRowsProcessed: {
      type: Number,
      default: 0,
      min: 0
    },
    errorCount: {
      type: Number,
      default: 0,
      min: 0
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    // Real-time progress telemetry fields (updated on every batch callback)
    lastProgressAt: {
      type: Date,
      default: null
    },
    currentRateRowsPerSec: {
      type: Number,
      default: 0
    },
    lastProgressWindowMs: {
      type: Number,
      default: 0
    },
    // Traceability and pipeline integration fields
    fileId: {
      type: String,
      index: true
    },
    fileSize: {
      type: Number,
      min: 0
    },
    targetSchema: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TargetSchema'
    },
    validRows: {
      type: Number,
      default: 0,
      min: 0
    },
    startedAt: {
      type: Date
    },
    completedAt: {
      type: Date
    },
    durationMs: {
      type: Number,
      min: 0
    },
    throughputRowsPerSec: {
      type: Number,
      default: 0
    },
    errorMessage: {
      type: String
    },
    summary: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
    versionKey: false
  }
);

// Compound indexes for rapid telemetry querying and dashboard filtering
IngestionJobSchema.index({ status: 1, createdAt: -1 });
IngestionJobSchema.index({ fileId: 1, status: 1 });
// Index to accelerate live telemetry SSE/polling queries
IngestionJobSchema.index({ jobId: 1, status: 1 });

/**
 * Instance method to record batch progress updates in real-time.
 * Computes a rolling rows/sec rate between consecutive calls using
 * a time-window delta so the SSE endpoint can report live throughput.
 *
 * @param {number} processedDelta - Number of rows processed in this batch
 * @param {number} [errorDelta=0]  - Number of errors in this batch
 */
IngestionJobSchema.methods.updateProgress = function (processedDelta, errorDelta = 0) {
  const now = new Date();
  const prevAt = this.lastProgressAt ? new Date(this.lastProgressAt) : (this.startedAt ? new Date(this.startedAt) : now);
  const windowMs = Math.max(now.getTime() - prevAt.getTime(), 1);

  this.totalRowsProcessed = (this.totalRowsProcessed || 0) + processedDelta;
  this.errorCount = (this.errorCount || 0) + errorDelta;
  this.validRows = Math.max(0, this.totalRowsProcessed - this.errorCount);

  // Rolling rate: rows added in this window / window duration
  this.currentRateRowsPerSec = +(processedDelta / (windowMs / 1000)).toFixed(2);
  this.lastProgressWindowMs = windowMs;
  this.lastProgressAt = now;

  return this.save();
};

/**
 * Instance method to mark job completion and record final metrics.
 */
IngestionJobSchema.methods.markCompleted = function (summary = {}) {
  const now = new Date();
  this.status = 'completed';
  this.completedAt = now;
  if (this.startedAt) {
    this.durationMs = now.getTime() - new Date(this.startedAt).getTime();
    const durationSec = Math.max(this.durationMs / 1000, 0.001);
    this.throughputRowsPerSec = Math.round(this.totalRowsProcessed / durationSec);
  }
  this.summary = summary;
  return this.save();
};

/**
 * Instance method to mark job failure.
 */
IngestionJobSchema.methods.markFailed = function (error) {
  this.status = 'failed';
  this.completedAt = new Date();
  this.currentRateRowsPerSec = 0;
  this.errorMessage = typeof error === 'string' ? error : error?.message || 'Unknown pipeline failure';
  return this.save();
};

/**
 * Instance method to mark job cancellation (stream aborted mid-way).
 */
IngestionJobSchema.methods.markCancelled = function (reason = 'Stream aborted') {
  this.status = 'cancelled';
  this.completedAt = new Date();
  this.currentRateRowsPerSec = 0;
  this.errorMessage = reason;
  if (this.startedAt) {
    this.durationMs = new Date().getTime() - new Date(this.startedAt).getTime();
  }
  return this.save();
};

const IngestionJob = mongoose.models.IngestionJob || mongoose.model('IngestionJob', IngestionJobSchema);

module.exports = IngestionJob;
