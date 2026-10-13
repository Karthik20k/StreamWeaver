'use strict';

const { Transform } = require('stream');
const { processField } = require('./transformHelpers');

class DataTransformerStream extends Transform {
  constructor(mappingRules = {}, options = {}) {
    super({
      ...options,
      objectMode: true,
    });

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
    const data = {};
    const errors = [];

    try {
      for (const [sourceKey, rule] of Object.entries(
        this.mappingRules
      )) {
        let fieldRule;

        if (typeof rule === 'string') {
          fieldRule = {
            sourceKey,
            targetKey: rule,
          };
        } else if (
          typeof rule === 'object' &&
          rule !== null
        ) {
          fieldRule = {
            ...rule,
            sourceKey,
            targetKey: rule.targetKey || sourceKey,
          };
        } else {
          fieldRule = {
            sourceKey,
            targetKey: sourceKey,
          };
        }

        const result = processField(
          chunk[sourceKey],
          fieldRule,
          rowNumber
        );

        data[fieldRule.targetKey] = result.value;
        errors.push(...result.errors);
      }

      this.push({
        isValid: errors.length === 0,
        data,
        errors,
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