'use strict';

const { Transform } = require('stream');
const { processField } = require('./transformHelpers');

class DataTransformerStream extends Transform {
  constructor(mappingRules = [], options = {}) {
    super({ ...options, objectMode: true });

    if (!Array.isArray(mappingRules)) {
      throw new TypeError('mappingRules must be an array');
    }

    this.mappingRules = mappingRules;
    this._rowIndex = 0;
  }

  _transform(chunk, _encoding, callback) {
    this._rowIndex += 1;
    const rowNumber = this._rowIndex;

    let result;

    try {
      result = this._applyRules(chunk, rowNumber);
    } catch (err) {
      result = {
        isValid: false,
        data: chunk,
        errors: [{ field: '__transform__', message: err.message, rowNumber }],
      };
    }

    this.push(result);
    callback();
  }

  _flush(callback) {
    callback();
  }

  _applyRules(rawRow, rowNumber) {
    const data = {};
    const errors = [];

    for (const rule of this.mappingRules) {
      const rawValue = rawRow[rule.sourceKey];
      const { value, errors: fieldErrors } = processField(rawValue, rule, rowNumber);
      data[rule.targetKey] = value;
      errors.push(...fieldErrors);
    }

    return { isValid: errors.length === 0, data, errors };
  }
}

module.exports = DataTransformerStream;
