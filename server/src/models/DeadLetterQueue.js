const mongoose = require('mongoose');

/**
 * DeadLetterQueue (DLQ) Schema:
 * Stores rejected, malformed, or invalid records during validation and streaming ingestion.
 * Enables post-mortem analysis, audit trails, and data reconciliation without halting pipelines.
 */
const DeadLetterQueueSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: [true, 'Job ID is required'],
      index: true
    },
    rowNumber: {
      type: Number,
      required: [true, 'Row number is required']
    },
    rawData: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    rejectedReason: {
      type: String,
      required: [true, 'Rejected reason is required']
    },
    failedField: {
      type: String,
      default: null,
      index: true
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

DeadLetterQueueSchema.index({ jobId: 1, rowNumber: 1 });
DeadLetterQueueSchema.index({ jobId: 1, timestamp: -1 });

const DeadLetterQueue = mongoose.models.DeadLetterQueue || mongoose.model('DeadLetterQueue', DeadLetterQueueSchema);

module.exports = DeadLetterQueue;
