const path = require('path');

const uploadConfig = {
  uploadDir: path.join(__dirname, '..', '..', 'uploads'),

  maxFileSizeBytes: 10 * 1024 * 1024 * 1024,

  allowedExtensions: ['.csv', '.tsv', '.json', '.jsonl', '.txt'],

  allowedMimeTypes: [
    'text/csv',
    'text/tab-separated-values',
    'application/json',
    'text/plain',
    'application/octet-stream',
    'application/vnd.ms-excel'
  ],

  busboy: {
    highWaterMark: 2 * 1024 * 1024,
    limits: {
      fileSize: 10 * 1024 * 1024 * 1024,
      files: 1,
      fields: 5
    }
  },

  writeStream: {
    highWaterMark: 64 * 1024
  }
};

module.exports = uploadConfig;