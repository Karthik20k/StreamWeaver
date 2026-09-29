const mongoose = require('mongoose');

/**
 * StagingDataSchema:
 * Stores high-throughput ingested records with traceability metadata and flexible payload.
 */
const StagingDataSchema = new mongoose.Schema(
  {
    fileId: {
      type: String,
      required: true,
      index: true
    },
    // jobId mirrors the IngestionJob.jobId for cross-collection telemetry joins and cleanup
    jobId: {
      type: String,
      index: true
    },
    batchId: {
      type: String,
      required: true,
      index: true
    },
    rowNumber: {
      type: Number,
      required: true
    },
    metadata: {
      sourceFileName: { type: String },
      ingestedAt: { type: Date, default: Date.now },
      workerId: { type: String },
      tags: { type: mongoose.Schema.Types.Mixed }
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    }
  },
  {
    timestamps: true,
    strict: false,
    versionKey: false
  }
);

// Compound index for fast range queries and file-level cleanup
StagingDataSchema.index({ fileId: 1, rowNumber: 1 });
StagingDataSchema.index({ fileId: 1, batchId: 1 });
// jobId-based indexes for cleanup and telemetry cross-collection queries
StagingDataSchema.index({ jobId: 1, rowNumber: 1 });
StagingDataSchema.index({ jobId: 1, batchId: 1 });

const StagingData = mongoose.models.StagingData || mongoose.model('StagingData', StagingDataSchema);

module.exports = StagingData;
