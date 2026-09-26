'use strict';

const { parseISO, isValid: isValidDate, formatISO } = require('date-fns');

const EMPTY_VALUES = new Set(['', 'n/a', 'N/A', 'null', 'NULL', 'undefined', 'UNDEFINED', 'none', 'NONE']);

function isEmpty(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string' && EMPTY_VALUES.has(value.trim())) return true;
  return false;
}

function sanitize(value, transformation) {
  const str = String(value);

  switch (transformation) {
    case 'trim':
      return str.trim();

    case 'uppercase':
      return str.trim().toUpperCase();

    case 'lowercase':
      return str.trim().toLowerCase();

    case 'titlecase':
      return str
        .trim()
        .toLowerCase()
        .replace(/(?:^|\s|-)\S/g, (c) => c.toUpperCase());

    case 'alphanumeric':
      return str.replace(/[^a-zA-Z0-9]/g, '');

    case 'strip_special':
      return str.replace(/[^a-zA-Z0-9\s.,\-_@]/g, '');

    default:
      return value;
  }
}

function castType(value, type) {
  switch (type) {
    case 'string':
      return { value: String(value), error: null };

    case 'number': {
      const n = Number(value);
      if (Number.isNaN(n)) return { value: null, error: `Cannot cast "${value}" to number` };
      return { value: n, error: null };
    }

    case 'integer': {
      const i = parseInt(String(value).replace(/[,_]/g, ''), 10);
      if (Number.isNaN(i)) return { value: null, error: `Cannot cast "${value}" to integer` };
      return { value: i, error: null };
    }

    case 'float': {
      const f = parseFloat(String(value).replace(/[,_]/g, ''));
      if (Number.isNaN(f)) return { value: null, error: `Cannot cast "${value}" to float` };
      return { value: f, error: null };
    }

    case 'boolean': {
      const lower = String(value).toLowerCase().trim();
      if (['true', '1', 'yes', 'y', 'on'].includes(lower)) return { value: true, error: null };
      if (['false', '0', 'no', 'n', 'off'].includes(lower)) return { value: false, error: null };
      return { value: null, error: `Cannot coerce "${value}" to boolean` };
    }

    case 'date': {
      let d = parseISO(String(value));
      if (!isValidDate(d)) d = new Date(value);
      if (!isValidDate(d)) return { value: null, error: `Cannot parse "${value}" as a date` };
      return { value: formatISO(d), error: null };
    }

    case 'timestamp': {
      const ts = Date.parse(String(value));
      if (Number.isNaN(ts)) return { value: null, error: `Cannot parse "${value}" as a timestamp` };
      return { value: ts, error: null };
    }

    default:
      return { value: String(value), error: null };
  }
}

function applyFallback(rule) {
  if (rule.fallback !== undefined) return rule.fallback;
  const defaults = { number: 0, integer: 0, float: 0.0, boolean: false, date: null, string: '' };
  return defaults[rule.type] !== undefined ? defaults[rule.type] : null;
}

function processField(rawValue, rule, rowNumber) {
  const errors = [];

  if (isEmpty(rawValue)) {
    if (rule.required) {
      errors.push({
        field: rule.targetKey,
        message: `Required field "${rule.targetKey}" (source: "${rule.sourceKey}") is missing`,
        rowNumber,
      });
      return { value: null, errors };
    }
    return { value: applyFallback(rule), errors };
  }

  let value = rawValue;

  for (const tx of rule.transformations || []) {
    value = sanitize(value, tx);
  }

  if (rule.type && rule.type !== 'string') {
    const cast = castType(value, rule.type);
    if (cast.error) {
      errors.push({ field: rule.targetKey, message: cast.error, rowNumber });
      return { value: applyFallback(rule), errors };
    }
    value = cast.value;
  } else {
    value = String(value);
  }

  return { value, errors };
}

module.exports = { isEmpty, sanitize, castType, applyFallback, processField };
