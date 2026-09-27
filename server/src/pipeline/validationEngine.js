/**
 * Lightweight High-Performance Validation Engine for StreamWeaver
 * 
 * Capabilities:
 * 1. Required target fields verification (null, undefined, empty string handling)
 * 2. Regex format validation (built-in patterns: email, phone, url, uuid, alphanumeric, or custom regex)
 * 3. Range & value constraints checking (min, max for numbers & string length & dates, allowedValues enum)
 * 4. Automatic DLQ (Dead Letter Queue) record structuring: { jobId, rowNumber, rawData, rejectedReason, failedField, timestamp }
 */

// Common standard regex patterns
const BUILT_IN_PATTERNS = {
  email: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/,
  phone: /^\+?[0-9\s\-().]{7,25}$/,
  url: /^(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)$/,
  uuid: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
  alphanumeric: /^[a-zA-Z0-9]+$/,
  identifier: /^[a-zA-Z0-9_-]+$/,
  numeric: /^-?\d+(\.\d+)?$/,
  dateISO: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/
};

// Regex cache to avoid compiling RegExp in hot loops
const regexCache = new Map();

/**
 * Get or compile a RegExp instance safely.
 * @param {string|RegExp} pattern
 * @returns {RegExp|null}
 */
function getCompiledRegex(pattern) {
  if (!pattern) return null;
  if (pattern instanceof RegExp) return pattern;

  const trimmed = pattern.trim();
  const lowerKey = trimmed.toLowerCase();

  // Check built-in shortcuts
  if (BUILT_IN_PATTERNS[lowerKey]) {
    return BUILT_IN_PATTERNS[lowerKey];
  }

  if (regexCache.has(trimmed)) {
    return regexCache.get(trimmed);
  }

  try {
    // Check if regex is formatted as /pattern/flags
    const match = trimmed.match(/^\/(.*)\/([gimsuy]*)$/);
    const compiled = match ? new RegExp(match[1], match[2]) : new RegExp(trimmed);
    // Keep cache bounded
    if (regexCache.size < 1000) {
      regexCache.set(trimmed, compiled);
    }
    return compiled;
  } catch {
    return null;
  }
}

/**
 * Validates a single value against field definition and constraints.
 * 
 * @param {any} rawVal - The input value to validate
 * @param {object} field - Field specification { name, type, constraints, ... }
 * @returns {{ isValid: boolean, error?: string, sanitizedValue?: any }}
 */
function validateField(rawVal, field = {}) {
  const constraints = field.constraints || {};
  const fieldName = field.name || 'unknown';
  const isRequired = Boolean(constraints.required);

  const isNullOrUndefined = rawVal === undefined || rawVal === null;
  const isBlank = typeof rawVal === 'string' && rawVal.trim() === '';
  const isEmpty = isNullOrUndefined || isBlank;

  // 1. Required field verification
  if (isRequired && isEmpty) {
    return {
      isValid: false,
      error: `Field '${fieldName}' is required but was empty or missing.`,
      sanitizedValue: undefined
    };
  }

  // Not required and empty -> apply default if present
  if (isEmpty) {
    return {
      isValid: true,
      sanitizedValue: constraints.defaultValue !== undefined ? constraints.defaultValue : null
    };
  }

  let sanitizedValue = rawVal;
  const type = field.type || 'String';

  // 2. Type casting & format checking
  switch (type) {
    case 'String': {
      sanitizedValue = String(rawVal).trim();
      break;
    }
    case 'Number': {
      const num = Number(rawVal);
      if (Number.isNaN(num)) {
        return {
          isValid: false,
          error: `Field '${fieldName}' expected Number, received: '${rawVal}'`,
          sanitizedValue: rawVal
        };
      }
      sanitizedValue = num;
      break;
    }
    case 'Date': {
      const date = new Date(rawVal);
      if (Number.isNaN(date.getTime())) {
        return {
          isValid: false,
          error: `Field '${fieldName}' expected valid Date, received: '${rawVal}'`,
          sanitizedValue: rawVal
        };
      }
      sanitizedValue = date;
      break;
    }
    case 'Boolean': {
      if (typeof rawVal === 'boolean') {
        sanitizedValue = rawVal;
      } else if (typeof rawVal === 'string') {
        const lower = rawVal.trim().toLowerCase();
        if (['true', '1', 'yes', 'y'].includes(lower)) sanitizedValue = true;
        else if (['false', '0', 'no', 'n'].includes(lower)) sanitizedValue = false;
        else {
          return {
            isValid: false,
            error: `Field '${fieldName}' expected Boolean, received: '${rawVal}'`,
            sanitizedValue: rawVal
          };
        }
      } else {
        sanitizedValue = Boolean(rawVal);
      }
      break;
    }
    case 'Mixed':
    default:
      sanitizedValue = rawVal;
      break;
  }

  // 3. Regex format validation (email, phone, custom patterns)
  const patternToTest = constraints.pattern || constraints.regex;
  if (patternToTest) {
    const re = getCompiledRegex(patternToTest);
    if (re) {
      const strVal = String(sanitizedValue);
      if (!re.test(strVal)) {
        const patternLabel = BUILT_IN_PATTERNS[patternToTest.toLowerCase()] 
          ? patternToTest.toLowerCase() 
          : `pattern (${patternToTest})`;
        return {
          isValid: false,
          error: `Field '${fieldName}' failed ${patternLabel} format validation with value: '${strVal}'`,
          sanitizedValue
        };
      }
    }
  }

  // 4. Range constraints (min, max)
  // For Numbers: min/max numeric value
  // For Strings: min/max length
  // For Dates: min/max date boundary
  if (constraints.min !== undefined && constraints.min !== null) {
    const minVal = Number(constraints.min);
    if (!Number.isNaN(minVal)) {
      if (type === 'Number' && sanitizedValue < minVal) {
        return {
          isValid: false,
          error: `Field '${fieldName}' value ${sanitizedValue} is below minimum allowed (${minVal}).`,
          sanitizedValue
        };
      }
      if (type === 'String' && sanitizedValue.length < minVal) {
        return {
          isValid: false,
          error: `Field '${fieldName}' length (${sanitizedValue.length}) is shorter than minimum required (${minVal}).`,
          sanitizedValue
        };
      }
      if (type === 'Date' && sanitizedValue.getTime() < minVal) {
        return {
          isValid: false,
          error: `Field '${fieldName}' date is before minimum allowed timestamp (${new Date(minVal).toISOString()}).`,
          sanitizedValue
        };
      }
    }
  }

  if (constraints.max !== undefined && constraints.max !== null) {
    const maxVal = Number(constraints.max);
    if (!Number.isNaN(maxVal)) {
      if (type === 'Number' && sanitizedValue > maxVal) {
        return {
          isValid: false,
          error: `Field '${fieldName}' value ${sanitizedValue} exceeds maximum allowed (${maxVal}).`,
          sanitizedValue
        };
      }
      if (type === 'String' && sanitizedValue.length > maxVal) {
        return {
          isValid: false,
          error: `Field '${fieldName}' length (${sanitizedValue.length}) exceeds maximum allowed (${maxVal}).`,
          sanitizedValue
        };
      }
      if (type === 'Date' && sanitizedValue.getTime() > maxVal) {
        return {
          isValid: false,
          error: `Field '${fieldName}' date is after maximum allowed timestamp (${new Date(maxVal).toISOString()}).`,
          sanitizedValue
        };
      }
    }
  }

  // 5. Allowed values (enum/whitelist validation)
  if (Array.isArray(constraints.allowedValues) && constraints.allowedValues.length > 0) {
    const isAllowed = constraints.allowedValues.some((allowed) => {
      if (typeof allowed === 'string' && typeof sanitizedValue === 'string') {
        return allowed.toLowerCase().trim() === sanitizedValue.toLowerCase().trim();
      }
      return allowed === sanitizedValue;
    });

    if (!isAllowed) {
      return {
        isValid: false,
        error: `Field '${fieldName}' value '${sanitizedValue}' is not in allowed values: [${constraints.allowedValues.join(', ')}]`,
        sanitizedValue
      };
    }
  }

  return {
    isValid: true,
    sanitizedValue
  };
}

/**
 * Validates a complete row/record against a target schema definition.
 * 
 * @param {Record<string, any>} row - Input record
 * @param {object} schema - TargetSchema instance or plain schema object with `fields`
 * @returns {{
 *   isValid: boolean,
 *   errors: Array<{ field: string, reason: string }>,
 *   sanitized: Record<string, any>
 * }}
 */
function validateRow(row, schema) {
  const fields = (schema && schema.fields) ? schema.fields : [];
  const errors = [];
  const sanitized = {};

  for (const field of fields) {
    const rawVal = row ? row[field.name] : undefined;
    const result = validateField(rawVal, field);

    if (!result.isValid) {
      errors.push({
        field: field.name,
        reason: result.error
      });
    } else if (result.sanitizedValue !== undefined) {
      sanitized[field.name] = result.sanitizedValue;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Format DLQ error records from validation failures.
 * Matches DeadLetterQueue schema: { jobId, rowNumber, rawData, rejectedReason, failedField, timestamp }
 * 
 * @param {object} params
 * @param {string} params.jobId - Associated ingestion job identifier
 * @param {number} params.rowNumber - Line or record index (1-based)
 * @param {any} params.rawData - The unedited source row
 * @param {Array<{ field: string, reason: string }>|string} params.errors - Validation errors
 * @returns {Array<object>} Array of DLQ documents ready for bulkWrite/insertMany
 */
function createDLQRecords({ jobId, rowNumber, rawData, errors }) {
  const now = new Date();

  if (typeof errors === 'string') {
    return [{
      jobId,
      rowNumber,
      rawData,
      rejectedReason: errors,
      failedField: null,
      timestamp: now
    }];
  }

  if (Array.isArray(errors) && errors.length > 0) {
    return errors.map((err) => ({
      jobId,
      rowNumber,
      rawData,
      rejectedReason: err.reason || 'Validation failed',
      failedField: err.field || null,
      timestamp: now
    }));
  }

  return [{
    jobId,
    rowNumber,
    rawData,
    rejectedReason: 'Unknown row validation rejection',
    failedField: null,
    timestamp: now
  }];
}

/**
 * Create a row validator function compatible with the streaming pipeline (RowValidationTransform).
 * 
 * @param {object} schema - TargetSchema instance or object
 * @param {object} [options]
 * @param {string} [options.jobId]
 * @returns {function(object, number): { isValid: boolean, error?: string, dlqRecords?: object[] }}
 */
function createPipelineRowValidator(schema, options = {}) {
  const jobId = options.jobId || 'job_stream';

  return function (row, rowNumber) {
    const result = validateRow(row, schema);
    if (!result.isValid) {
      const dlqRecords = createDLQRecords({
        jobId,
        rowNumber,
        rawData: row,
        errors: result.errors
      });

      const firstError = result.errors[0];
      return {
        isValid: false,
        error: firstError ? `${firstError.field}: ${firstError.reason}` : 'Row validation failed',
        errorType: 'VALIDATION_FAILED',
        dlqRecords,
        details: result.errors
      };
    }

    return {
      isValid: true,
      sanitized: result.sanitized
    };
  };
}

module.exports = {
  BUILT_IN_PATTERNS,
  getCompiledRegex,
  validateField,
  validateRow,
  createDLQRecords,
  createPipelineRowValidator
};
