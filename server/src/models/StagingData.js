const mongoose = require('mongoose');

/**
 * StagingDataSchema:
 * Stores high-throughput ingested records with traceability metadata and flexible payload.
 *
 * Index additions (v2):
 *  - { jobId: 1, rowNumber: 1 }  : Low-latency keyset pagination for Developer 3
 *  - { jobId: 1, createdAt: -1 } : Reverse-chronological job-scoped pagination
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
    // createdAt and updatedAt managed by Mongoose; createdAt is indexed below
    // for reverse-chronological pagination queries.
    timestamps: true,
    strict: false,
    versionKey: false
  }
);

// --- Existing indexes ---
// Fast range queries and file-level cleanup
StagingDataSchema.index({ fileId: 1, rowNumber: 1 });
StagingDataSchema.index({ fileId: 1, batchId: 1 });
// jobId-based indexes for cleanup and telemetry cross-collection queries
StagingDataSchema.index({ jobId: 1, batchId: 1 });

// --- Pagination indexes for Developer 3 ---
// Compound index: supports low-latency keyset pagination sorted by rowNumber within a job
StagingDataSchema.index({ jobId: 1, rowNumber: 1 });
// Compound index: supports reverse-chronological pagination and time-range queries within a job
StagingDataSchema.index({ jobId: 1, createdAt: -1 });

const StagingData = mongoose.models.StagingData || mongoose.model('StagingData', StagingDataSchema);

module.exports = StagingData;
