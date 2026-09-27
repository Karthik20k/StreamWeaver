/**
 * StreamWeaver - Transformation Rules & Simulation Engine
 * Defines rules for Dev 3 UI and mirrors Dev 1's streaming transform engine
 */

export const CASING_OPTIONS = [
  { id: 'none', label: 'No Casing Change', desc: 'Preserve original casing' },
  { id: 'uppercase', label: 'UPPERCASE', desc: 'Convert all characters to uppercase' },
  { id: 'lowercase', label: 'lowercase', desc: 'Convert all characters to lowercase' },
  { id: 'titlecase', label: 'Title Case', desc: 'Capitalize the first letter of each word' }
];

export const TYPECAST_OPTIONS = [
  { id: 'string', label: 'String (Text)', desc: 'Store as standard UTF-8 string' },
  { id: 'float', label: 'Float / Decimal', desc: 'Parse numerical value with decimal precision' },
  { id: 'integer', label: 'Integer', desc: 'Parse whole number via parseInt(10)' },
  { id: 'date', label: 'Date (ISO-8601)', desc: 'Parse date and convert to ISO standard timestamp' },
  { id: 'boolean', label: 'Boolean', desc: 'Coerce true/false, 1/0, yes/no to boolean' }
];

export const DATE_FORMAT_OPTIONS = [
  { id: 'YYYY-MM-DD', label: 'YYYY-MM-DD', desc: 'Standard ISO calendar date (2026-09-26)' },
  { id: 'ISO-8601', label: 'Full ISO-8601 UTC', desc: '2026-09-26T12:00:00.000Z' },
  { id: 'MM/DD/YYYY', label: 'MM/DD/YYYY', desc: 'US standard date notation' },
  { id: 'DD/MM/YYYY', label: 'DD/MM/YYYY', desc: 'International standard date notation' },
  { id: 'timestamp', label: 'Unix Epoch (ms)', desc: 'Milliseconds since Jan 1, 1970' }
];

export const DEFAULT_TRANSFORMATION_RULE = {
  trim: true,
  casing: 'none',
  typeCast: 'string',
  dateFormat: 'YYYY-MM-DD',
  nullifyEmpty: true,
  defaultValue: '',
  stripNonNumeric: false
};

/**
 * Returns tailored default rules matching target field specifications
 */
export function getDefaultRuleForTarget(targetField) {
  const type = (targetField?.type || 'String').toLowerCase();
  const name = (targetField?.name || '').toLowerCase();

  if (type === 'number') {
    return {
      trim: true,
      casing: 'none',
      typeCast: 'float',
      dateFormat: 'YYYY-MM-DD',
      nullifyEmpty: true,
      defaultValue: '0',
      stripNonNumeric: true
    };
  }

  if (type === 'date') {
    return {
      trim: true,
      casing: 'none',
      typeCast: 'date',
      dateFormat: 'ISO-8601',
      nullifyEmpty: true,
      defaultValue: '',
      stripNonNumeric: false
    };
  }

  if (type === 'boolean') {
    return {
      trim: true,
      casing: 'lowercase',
      typeCast: 'boolean',
      dateFormat: 'YYYY-MM-DD',
      nullifyEmpty: true,
      defaultValue: 'false',
      stripNonNumeric: false
    };
  }

  // String defaults
  const shouldUpper = name.includes('code') || name.includes('id') || name.includes('currency') || name.includes('sku');
  return {
    trim: true,
    casing: shouldUpper ? 'uppercase' : 'none',
    typeCast: 'string',
    dateFormat: 'YYYY-MM-DD',
    nullifyEmpty: true,
    defaultValue: '',
    stripNonNumeric: false
  };
}

/**
 * To Title Case helper
 */
export function toTitleCase(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/(?:^|\s|-|_)\S/g, (match) => match.toUpperCase());
}

/**
 * Live transformation simulator mirroring Dev 1 transform stream
 */
export function applyTransformationRules(rawValue, ruleConfig = {}) {
  const rules = { ...DEFAULT_TRANSFORMATION_RULE, ...ruleConfig };
  const appliedSteps = [];

  if (rawValue === undefined || rawValue === null) {
    if (rules.defaultValue) {
      appliedSteps.push(`Default: ${rules.defaultValue}`);
      return { output: rules.defaultValue, isValid: true, appliedSteps };
    }
    return { output: null, isValid: true, appliedSteps: ['Null'] };
  }

  let str = String(rawValue);

  // 1. Trim Whitespace
  if (rules.trim) {
    const trimmed = str.trim();
    if (trimmed !== str) {
      appliedSteps.push('Trimmed');
      str = trimmed;
    }
  }

  // 2. Empty / Nullify check
  const emptyIndicators = ['', 'n/a', 'null', 'undefined', 'none', '-'];
  if (rules.nullifyEmpty && emptyIndicators.includes(str.toLowerCase())) {
    if (rules.defaultValue) {
      appliedSteps.push(`Fallback: ${rules.defaultValue}`);
      str = rules.defaultValue;
    } else {
      appliedSteps.push('Nullified Empty');
      return { output: null, isValid: true, appliedSteps };
    }
  }

  // 3. Strip non-numeric symbols if requested (e.g. '$19.99' -> '19.99')
  if (rules.stripNonNumeric && (rules.typeCast === 'float' || rules.typeCast === 'integer')) {
    const cleaned = str.replace(/[^0-9.-]+/g, '');
    if (cleaned !== str) {
      appliedSteps.push('Stripped Non-Numeric');
      str = cleaned;
    }
  }

  // 4. Casing conversions
  if (rules.casing === 'uppercase') {
    str = str.toUpperCase();
    appliedSteps.push('Uppercase');
  } else if (rules.casing === 'lowercase') {
    str = str.toLowerCase();
    appliedSteps.push('Lowercase');
  } else if (rules.casing === 'titlecase') {
    str = toTitleCase(str);
    appliedSteps.push('Title Case');
  }

  // 5. Type Casting
  let finalVal = str;
  let isValid = true;

  switch (rules.typeCast) {
    case 'integer': {
      const parsedInt = parseInt(str, 10);
      if (isNaN(parsedInt)) {
        isValid = false;
        appliedSteps.push('Cast Error: Invalid Integer');
        finalVal = rules.defaultValue ? parseInt(rules.defaultValue, 10) : null;
      } else {
        finalVal = parsedInt;
        appliedSteps.push('Cast Integer');
      }
      break;
    }

    case 'float': {
      const parsedFloat = parseFloat(str);
      if (isNaN(parsedFloat)) {
        isValid = false;
        appliedSteps.push('Cast Error: Invalid Float');
        finalVal = rules.defaultValue ? parseFloat(rules.defaultValue) : null;
      } else {
        finalVal = parsedFloat;
        appliedSteps.push('Cast Float');
      }
      break;
    }

    case 'date': {
      const parsedDate = new Date(str);
      if (isNaN(parsedDate.getTime())) {
        isValid = false;
        appliedSteps.push('Cast Error: Invalid Date');
        finalVal = rules.defaultValue || null;
      } else {
        if (rules.dateFormat === 'YYYY-MM-DD') {
          finalVal = parsedDate.toISOString().split('T')[0];
        } else if (rules.dateFormat === 'timestamp') {
          finalVal = parsedDate.getTime();
        } else if (rules.dateFormat === 'MM/DD/YYYY') {
          const m = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
          const d = String(parsedDate.getUTCDate()).padStart(2, '0');
          const y = parsedDate.getUTCFullYear();
          finalVal = `${m}/${d}/${y}`;
        } else if (rules.dateFormat === 'DD/MM/YYYY') {
          const d = String(parsedDate.getUTCDate()).padStart(2, '0');
          const m = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
          const y = parsedDate.getUTCFullYear();
          finalVal = `${d}/${m}/${y}`;
        } else {
          finalVal = parsedDate.toISOString();
        }
        appliedSteps.push(`Date (${rules.dateFormat})`);
      }
      break;
    }

    case 'boolean': {
      const lowered = str.toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(lowered)) {
        finalVal = true;
        appliedSteps.push('Cast Boolean (true)');
      } else if (['false', '0', 'no', 'n'].includes(lowered)) {
        finalVal = false;
        appliedSteps.push('Cast Boolean (false)');
      } else {
        finalVal = Boolean(str);
        appliedSteps.push('Coerced Boolean');
      }
      break;
    }

    default:
      // string
      break;
  }

  return {
    original: rawValue,
    output: finalVal,
    isValid,
    appliedSteps
  };
}

/**
 * Returns concise summary badges of active rules
 */
export function describeActiveRules(rules = {}) {
  const tags = [];
  if (rules.trim) tags.push('Trim');
  if (rules.casing && rules.casing !== 'none') tags.push(rules.casing.toUpperCase());
  if (rules.typeCast && rules.typeCast !== 'string') tags.push(rules.typeCast.toUpperCase());
  if (rules.typeCast === 'date' && rules.dateFormat) tags.push(rules.dateFormat);
  if (rules.defaultValue) tags.push(`Default: ${rules.defaultValue}`);
  return tags;
}
