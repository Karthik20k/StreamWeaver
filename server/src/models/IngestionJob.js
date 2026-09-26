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

/**
 * Instance method to record batch progress updates in real-time.
 */
IngestionJobSchema.methods.updateProgress = function (processedDelta, errorDelta = 0) {
  this.totalRowsProcessed = (this.totalRowsProcessed || 0) + processedDelta;
  this.errorCount = (this.errorCount || 0) + errorDelta;
  this.validRows = Math.max(0, this.totalRowsProcessed - this.errorCount);
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
  this.errorMessage = typeof error === 'string' ? error : error?.message || 'Unknown pipeline failure';
  return this.save();
};

const IngestionJob = mongoose.models.IngestionJob || mongoose.model('IngestionJob', IngestionJobSchema);

module.exports = IngestionJob;
