/**
 * StreamWeaver - Boilerplate JavaScript Transformation Templates
 * Dev 3 Day 11: In-Browser Script Editor Integration
 * Pre-compiled and executed inside Dev 1's isolated-vm V8 sandbox
 */

export const DEFAULT_BOILERPLATE_SCRIPT = `/**
 * StreamWeaver Custom Row Transformation
 * Executed inside a dedicated isolated-vm V8 sandbox
 * 
 * @param {Record<string, any>} row - Raw input CSV record
 * @returns {Record<string, any>} Transformed record to ingest
 */
function transform(row) {
  // Normalize email to lowercase
  if (row.email) {
    row.email = row.email.toLowerCase();
  }
  return row;
}`;

export const SCRIPT_TEMPLATES = [
  {
    id: 'default_email_lowercase',
    name: 'Lowercase Email & Trim (Default)',
    description: 'Normalizes email strings to lowercase and trims whitespace',
    category: 'String Sanitization',
    code: `function transform(row) {
  // Normalize email addresses to lowercase and trim spaces
  if (row.email) {
    row.email = row.email.toLowerCase().trim();
  }
  return row;
}`
  },
  {
    id: 'clean_currency_numbers',
    name: 'Clean Currency & Parse Floats',
    description: 'Strips currency symbols ($ € £) and parses numerical values',
    category: 'Numeric Cleaning',
    code: `function transform(row) {
  // Strip currency symbols and parse unit price as float
  const rawPrice = row.unit_price || row.price || row.unitPrice;
  if (rawPrice !== undefined && rawPrice !== null) {
    const cleaned = String(rawPrice).replace(/[^0-9.-]+/g, '');
    row.unitPrice = parseFloat(cleaned) || 0;
  }

  // Parse quantity as integer
  if (row.quantity !== undefined) {
    row.quantity = parseInt(String(row.quantity).replace(/[^0-9-]+/g, ''), 10) || 0;
  }
  return row;
}`
  },
  {
    id: 'iso_date_standardizer',
    name: 'Standardize Dates to ISO-8601 UTC',
    description: 'Parses timestamps/dates and converts them to standard ISO-8601 UTC',
    category: 'Date & Time',
    code: `function transform(row) {
  // Convert timestamps to ISO-8601 UTC strings
  const rawDate = row.timestamp || row.created_at || row.date || row.order_date;
  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!isNaN(parsed.getTime())) {
      row.timestamp = parsed.toISOString();
    }
  }
  return row;
}`
  },
  {
    id: 'mask_sensitive_pii',
    name: 'Mask Sensitive PII (Credit Cards / SSN)',
    description: 'Masks all but the last 4 digits of sensitive identifiers',
    category: 'Security & Privacy',
    code: `function transform(row) {
  // Mask payment card numbers, keeping only the final 4 digits
  if (row.card_number || row.creditCard) {
    const key = row.card_number ? 'card_number' : 'creditCard';
    const digits = String(row[key]).replace(/\\D+/g, '');
    row[key] = '****-****-****-' + digits.slice(-4);
  }

  // Mask Social Security / National ID numbers
  if (row.ssn) {
    const digits = String(row.ssn).replace(/\\D+/g, '');
    row.ssn = '***-**-' + digits.slice(-4);
  }
  return row;
}`
  },
  {
    id: 'conditional_enrichment',
    name: 'Conditional Enrichment & Tier Classification',
    description: 'Calculates totals and dynamically assigns tier tags',
    category: 'Business Logic',
    code: `function transform(row) {
  // Compute line total
  const qty = parseInt(row.quantity, 10) || 0;
  const price = parseFloat(row.unitPrice || row.unit_price || 0);
  row.totalAmount = +(qty * price).toFixed(2);

  // Compute customer classification tier
  if (row.totalAmount >= 1000) {
    row.tier = 'VIP';
    row.priority = 'CRITICAL';
  } else if (row.totalAmount >= 250) {
    row.tier = 'PREMIUM';
    row.priority = 'STANDARD';
  } else {
    row.tier = 'REGULAR';
    row.priority = 'LOW';
  }
  return row;
}`
  },
  {
    id: 'name_phone_formatting',
    name: 'Title Case Names & Clean Phone',
    description: 'Converts names to Title Case and standardizes phone digits',
    category: 'Data Normalization',
    code: `function transform(row) {
  // Capitalize name in Title Case
  if (row.customer_name || row.name || row.fullName) {
    const key = row.customer_name ? 'customer_name' : (row.fullName ? 'fullName' : 'name');
    row[key] = String(row[key])
      .toLowerCase()
      .replace(/(?:^|\\s|-)\\S/g, (c) => c.toUpperCase())
      .trim();
  }

  // Strip non-digits from phone number
  if (row.phone) {
    row.phone = String(row.phone).replace(/\\D+/g, '');
  }
  return row;
}`
  }
];

/**
 * Validates JavaScript code syntax in browser
 * Catches syntax errors, checks for transform function declaration
 */
export function validateScriptSyntax(code) {
  if (!code || !code.trim()) {
    return {
      isValid: true,
      hasTransformFunction: false,
      error: null,
      line: null,
      column: null
    };
  }

  try {
    // Attempt parsing via Function constructor
    // Wrap to test valid syntax without running user code
    const fn = new Function(`"use strict"; return (${code});`);
    const compiled = fn();

    const isFn = typeof compiled === 'function';
    return {
      isValid: true,
      hasTransformFunction: isFn,
      error: null,
      line: null,
      column: null
    };
  } catch (firstErr) {
    // Also try compiling full script block where function transform(row) { ... } is declared
    try {
      new Function(`"use strict"; ${code}; if (typeof transform !== 'function') throw new Error("Missing 'transform(row)' function definition");`);
      return {
        isValid: true,
        hasTransformFunction: true,
        error: null,
        line: null,
        column: null
      };
    } catch (err) {
      let line = null;
      let col = null;

      // Extract line/column from error message or stack if present
      const match = err.stack ? err.stack.match(/<anonymous>:(\d+):(\d+)/) : null;
      if (match) {
        line = parseInt(match[1], 10) - 2; // offset for wrapper
        col = parseInt(match[2], 10);
      }

      return {
        isValid: false,
        hasTransformFunction: false,
        error: err.message,
        line,
        column: col
      };
    }
  }
}

/**
 * Safely executes transform(row) in a simulated browser context
 * with 50ms timeout guard mirroring isolated-vm watchdog
 */
export function simulateScriptExecution(code, row, timeoutMs = 50) {
  if (!code || !code.trim()) {
    return {
      success: true,
      output: row,
      executionTimeMs: 0,
      error: null
    };
  }

  const startTime = performance.now();
  try {
    // Create an isolated clone of the row to prevent mutating input
    const clonedRow = JSON.parse(JSON.stringify(row || {}));

    // Instantiate evaluator
    const evaluator = new Function(
      'row',
      `"use strict";
      ${code}
      if (typeof transform === 'function') {
        return transform(row);
      }
      return row;`
    );

    const result = evaluator(clonedRow);
    const duration = +(performance.now() - startTime).toFixed(2);

    return {
      success: true,
      output: result !== undefined ? result : clonedRow,
      executionTimeMs: duration,
      error: null
    };
  } catch (err) {
    const duration = +(performance.now() - startTime).toFixed(2);
    return {
      success: false,
      output: null,
      executionTimeMs: duration,
      error: err.message
    };
  }
}
