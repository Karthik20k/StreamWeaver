const mongoose = require('mongoose');

/**
 * DeadLetterQueue (DLQ) Schema:
 * Stores rejected, malformed, or invalid records during validation and streaming ingestion.
 * Captures full error provenance for post-mortem analysis, audit trails, and data reconciliation
 * without halting pipelines.
 *
 * Fields added beyond the original baseline:
 *  - fileId       : File-level identifier (mirrors IngestionJob.fileId)
 *  - rawRow       : The original unparsed row (alias of rawData; retained for schema compat)
 *  - errorType    : Machine-readable error category (e.g. VALIDATION_FAILED, SCHEMA_VALIDATION_FAILED, MALFORMED_ROW)
 *  - errorMessage : Human-readable error description
 *  - details      : Structured map of per-field validation errors and diagnostic context
 *  - stackTrace   : Full JavaScript stack trace string (when available from the throwing context)
 */
const DeadLetterQueueSchema = new mongoose.Schema(
  {
    // --- Core identifiers ---
    jobId: {
      type: String,
      required: [true, 'Job ID is required'],
      index: true
    },
    fileId: {
      type: String,
      default: null,
      index: true
    },
    rowNumber: {
      type: Number,
      required: [true, 'Row number is required']
    },

    // --- Source data capture ---
    rawData: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    // rawRow mirrors rawData; persisted separately so consumers can distinguish
    // between the raw inbound row and any partially-transformed payload.
    rawRow: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    // --- Rejection reason (human-readable) ---
    rejectedReason: {
      type: String,
      required: [true, 'Rejected reason is required']
    },

    // --- Error classification ---
    // Machine-readable category: VALIDATION_FAILED | SCHEMA_VALIDATION_FAILED | MALFORMED_ROW
    errorType: {
      type: String,
      default: 'MALFORMED_ROW',
      index: true
    },
    // Duplicate of rejectedReason kept for interface parity with UploadError model
    errorMessage: {
      type: String,
      default: null
    },

    // --- Field-level context ---
    failedField: {
      type: String,
      default: null,
      index: true
    },
    // Structured per-field validation errors and diagnostic metadata
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    // --- Full error trace (available when error is thrown from JS context) ---
    stackTrace: {
      type: String,
      default: null
    },

    // --- Timestamps ---
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    // createdAt / updatedAt managed by Mongoose
    timestamps: { createdAt: 'createdAt', updatedAt: false },
    versionKey: false,
    // Allow additional fields from sandbox-rejected records without stripping them
    strict: false
  }
);

// Compound indexes for Developer 3 low-latency pagination & audit dashboards
DeadLetterQueueSchema.index({ jobId: 1, rowNumber: 1 });
DeadLetterQueueSchema.index({ jobId: 1, createdAt: -1 });
DeadLetterQueueSchema.index({ jobId: 1, timestamp: -1 });
// Index for error-type triage dashboards
DeadLetterQueueSchema.index({ jobId: 1, errorType: 1 });
// Index for file-scoped DLQ queries
DeadLetterQueueSchema.index({ fileId: 1, rowNumber: 1 });

const DeadLetterQueue = mongoose.models.DeadLetterQueue || mongoose.model('DeadLetterQueue', DeadLetterQueueSchema);

module.exports = DeadLetterQueue;
