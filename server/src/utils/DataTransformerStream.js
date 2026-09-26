'use strict';

const { Transform } = require('stream');

class DataTransformerStream extends Transform {
  constructor(mappingRules = {}, options = {}) {
    super({ ...options, objectMode: true });

    if (
      typeof mappingRules !== 'object' ||
      mappingRules === null ||
      Array.isArray(mappingRules)
    ) {
      throw new TypeError('mappingRules must be an object');
    }

    this.mappingRules = mappingRules;
    this._rowIndex = 0;
  }

  _transform(chunk, _encoding, callback) {
    this._rowIndex += 1;

    const rowNumber = this._rowIndex;

    try {
      const data = {};

      for (const [sourceKey, targetKey] of Object.entries(
        this.mappingRules
      )) {
        data[targetKey] = chunk[sourceKey];
      }

      this.push({
        isValid: true,
        data,
        errors: [],
      });

      callback();
    } catch (err) {
      this.push({
        isValid: false,
        data: chunk,
        errors: [
          {
            field: '__transform__',
            message: err.message,
            rowNumber,
          },
        ],
      });

      callback();
    }
  }

  _flush(callback) {
    callback();
  }
}

module.exports = DataTransformerStream;