const { Transform } = require('node:stream');
const csvParser = require('csv-parser');

/**
 * Creates a configured csv-parser stream instance.
 * @param {object} options
 * @param {string} [options.separator=',']
 * @param {boolean} [options.trim=true]
 * @returns {import('stream').Transform}
 */
function createCsvParserStream(options = {}) {
  const {
    separator = ',',
    trim = true,
    ...restOptions
  } = options;

  return csvParser({
    separator,
    mapHeaders: ({ header }) => (trim && header ? header.trim() : header),
    ...restOptions
  });
}

/**
 * RowValidationTransform:
 * Inspects parsed CSV rows against the detected headers.
 * Intercepts invalid rows (e.g., column count mismatch, missing values, malformed keys)
 * without halting the stream. Valid rows are passed downstream; invalid rows are routed to the error collector.
 */
class RowValidationTransform extends Transform {
  /**
   * @param {object} options
   * @param {string} options.fileId - Tracking ID for the file ingestion
   * @param {number} [options.expectedColumnCount] - Expected number of columns (optional, auto-detected from headers)
   * @param {function} [options.rowValidator] - Optional custom validation function (row, rowNumber) => { isValid: boolean, error?: string }
   * @param {function} [options.onErrorRow] - Callback/hook invoked when an invalid row is intercepted
   */
  constructor(options = {}) {
    super({ objectMode: true });
    this.fileId = options.fileId || 'unknown_file';
    this.expectedHeaders = [];
    this.expectedColumnCount = options.expectedColumnCount || null;
    this.rowValidator = options.rowValidator || null;
    this.onErrorRow = options.onErrorRow || null;

    this.rowNumber = 0;
    this.validRowCount = 0;
    this.invalidRowCount = 0;
  }

  /**
   * Attach header metadata detected by csv-parser
   * @param {string[]} headers
   */
  setHeaders(headers) {
    this.expectedHeaders = headers || [];
    if (!this.expectedColumnCount) {
      this.expectedColumnCount = this.expectedHeaders.length;
    }
  }

  _transform(row, encoding, callback) {
    this.rowNumber++;

    // 1. Column Count & Structure Verification
    const keys = Object.keys(row);
    // csv-parser attaches extra unmapped columns as '_0', '_1', etc.
    const extraColumns = keys.filter(k => /^_+\d+$/.test(k) || (this.expectedHeaders.length > 0 && !this.expectedHeaders.includes(k)));
    const hasExtraColumns = extraColumns.length > 0;

    let isMalformed = false;
    let errorType = null;
    let errorMessage = null;

    const actualColumnCount = keys.length;
    const expectedCount = this.expectedColumnCount || this.expectedHeaders.length || actualColumnCount;

    if (this.expectedHeaders.length > 0) {
      if (hasExtraColumns || actualColumnCount > expectedCount) {
        isMalformed = true;
        errorType = 'COLUMN_COUNT_MISMATCH';
        errorMessage = `Row has ${actualColumnCount} columns, expected ${expectedCount}. Extra columns detected: ${extraColumns.join(', ')}`;
      } else if (actualColumnCount < expectedCount) {
        isMalformed = true;
        errorType = 'COLUMN_COUNT_MISMATCH';
        errorMessage = `Row has ${actualColumnCount} columns, expected ${expectedCount}. Missing columns detected.`;
      }
    }

    // 2. Custom Business/Data Validator (if supplied)
    if (!isMalformed && typeof this.rowValidator === 'function') {
      try {
        const valResult = this.rowValidator(row, this.rowNumber);
        if (valResult && valResult.isValid === false) {
          isMalformed = true;
          errorType = valResult.errorType || 'VALIDATION_FAILED';
          errorMessage = valResult.error || 'Custom validation failed';
        }
      } catch (err) {
        isMalformed = true;
        errorType = 'VALIDATION_FAILED';
        errorMessage = `Validator exception: ${err.message}`;
      }
    }

    // 3. Error Isolation: If malformed, route to isolated error handler
    if (isMalformed) {
      this.invalidRowCount++;

      const errorRecord = {
        fileId: this.fileId,
        rowNumber: this.rowNumber,
        rawRow: row,
        errorType: errorType || 'MALFORMED_ROW',
        errorMessage: errorMessage || 'Malformed CSV line',
        details: {
          expectedColumnCount: expectedCount,
          actualColumnCount,
          headers: this.expectedHeaders
        },
        createdAt: new Date()
      };

      // Emit event for real-time observability
      this.emit('invalid-row', errorRecord);

      // Invoke optional sync/async error handler hook (e.g. error batcher)
      if (typeof this.onErrorRow === 'function') {
        try {
          this.onErrorRow(errorRecord);
        } catch (hookErr) {
          // Keep stream alive regardless of hook failure
          console.error(`[RowValidationTransform] Error hook failure: ${hookErr.message}`);
        }
      }

      // Do NOT push to downstream staging data stream!
      return callback();
    }

    // 4. Valid Row: pass downstream to micro-batching pipeline
    this.validRowCount++;
    this.push({
      fileId: this.fileId,
      rowNumber: this.rowNumber,
      payload: row
    });

    callback();
  }

  getStats() {
    return {
      totalRows: this.rowNumber,
      validRows: this.validRowCount,
      invalidRows: this.invalidRowCount
    };
  }
}

module.exports = {
  createCsvParserStream,
  RowValidationTransform
};
