const mongoose = require('mongoose');

/**
 * UploadErrorSchema:
 * Isolated collection for storing malformed or unparseable CSV rows without halting the stream pipeline.
 */
const UploadErrorSchema = new mongoose.Schema(
  {
    fileId: {
      type: String,
      required: true,
      index: true
    },
    rowNumber: {
      type: Number,
      required: true
    },
    rawRow: {
      type: mongoose.Schema.Types.Mixed
    },
    errorType: {
      type: String,
      required: true,
      enum: [
        'COLUMN_COUNT_MISMATCH',
        'MALFORMED_ROW',
        'PARSER_ERROR',
        'VALIDATION_FAILED',
        'SCHEMA_TYPE_ERROR'
      ]
    },
    errorMessage: {
      type: String,
      required: true
    },
    details: {
      expectedColumnCount: { type: Number },
      actualColumnCount: { type: Number },
      headers: [String],
      rawLineSnippet: { type: String }
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

UploadErrorSchema.index({ fileId: 1, rowNumber: 1 });
UploadErrorSchema.index({ fileId: 1, errorType: 1 });

const UploadError = mongoose.models.UploadError || mongoose.model('UploadError', UploadErrorSchema);

module.exports = UploadError;
