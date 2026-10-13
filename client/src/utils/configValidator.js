/**
 * StreamWeaver - Pre-Upload Mapping Configuration Validator
 * Validates required target fields, checks for duplicate mappings, and detects type incompatibilities
 */

/**
 * Validates active schema mappings before starting ingestion
 * 
 * @param {object} mappings Dictionary of { [sourceColumn]: targetFieldName }
 * @param {object[]} targetFields Array of target schema field objects
 * @param {string[]} sourceHeaders Array of CSV source header strings
 * @param {object} inferredTypes Map of inferred source types { [sourceCol]: 'str' | 'num' | 'date' | 'bool' }
 * @returns {object} Validation result object
 */
export function validateMappingConfig(
  mappings = {},
  targetFields = [],
  sourceHeaders = [],
  inferredTypes = {}
) {
  const errors = [];
  const warnings = [];

  // ------------------------------------------------------------------------
  // 1. Required Target Fields Verification
  // ------------------------------------------------------------------------
  const mappedTargetNames = new Set(Object.values(mappings).filter(Boolean));
  const missingRequiredFields = [];

  for (const field of targetFields) {
    if (field.required && !mappedTargetNames.has(field.name)) {
      missingRequiredFields.push(field);
      errors.push({
        type: 'MISSING_REQUIRED',
        severity: 'critical',
        field: field.name,
        label: field.label || field.name,
        targetType: field.type,
        message: `Required database field "${field.label || field.name}" (${field.type}) is unmapped.`
      });
    }
  }

  // ------------------------------------------------------------------------
  // 2. Duplicate Target Field Mappings Detection
  // ------------------------------------------------------------------------
  // Detect multiple source columns mapped to the exact same target field
  const targetToSources = {};
  for (const [sourceCol, targetName] of Object.entries(mappings)) {
    if (!targetName) continue;
    if (!targetToSources[targetName]) {
      targetToSources[targetName] = [];
    }
    targetToSources[targetName].push(sourceCol);
  }

  const duplicateTargetAlerts = [];
  for (const [targetName, sources] of Object.entries(targetToSources)) {
    if (sources.length > 1) {
      const fieldDef = targetFields.find(f => f.name === targetName);
      const alert = {
        type: 'DUPLICATE_TARGET',
        severity: 'critical',
        targetField: targetName,
        targetLabel: fieldDef?.label || targetName,
        conflictingSources: sources,
        message: `Multiple source columns (${sources.map(s => `"${s}"`).join(', ')}) are mapped to the same target field "${targetName}".`
      };
      duplicateTargetAlerts.push(alert);
      errors.push(alert);
    }
  }

  // ------------------------------------------------------------------------
  // 3. Type Compatibility Warnings
  // ------------------------------------------------------------------------
  const typeWarnings = [];
  for (const [sourceCol, targetName] of Object.entries(mappings)) {
    if (!targetName) continue;
    const targetDef = targetFields.find(f => f.name === targetName);
    const sourceInferred = inferredTypes[sourceCol];

    if (targetDef && sourceInferred) {
      // Inferred as string, but target expects Number
      if (targetDef.type === 'Number' && sourceInferred === 'str') {
        const warning = {
          type: 'TYPE_POSSIBLE_MISMATCH',
          severity: 'warning',
          sourceColumn: sourceCol,
          targetField: targetName,
          message: `Source column "${sourceCol}" inferred as text/string, but target "${targetName}" expects Number.`
        };
        typeWarnings.push(warning);
        warnings.push(warning);
      }

      // Inferred as string, but target expects Date
      if (targetDef.type === 'Date' && sourceInferred === 'str') {
        const warning = {
          type: 'TYPE_POSSIBLE_MISMATCH',
          severity: 'warning',
          sourceColumn: sourceCol,
          targetField: targetName,
          message: `Source column "${sourceCol}" inferred as text/string, but target "${targetName}" expects Date.`
        };
        typeWarnings.push(warning);
        warnings.push(warning);
      }
    }
  }

  // ------------------------------------------------------------------------
  // 4. Overall Status Calculation
  // ------------------------------------------------------------------------
  const criticalErrorsCount = errors.filter(e => e.severity === 'critical').length;
  const isValid = criticalErrorsCount === 0;
  const canProceed = isValid;

  const totalRequired = targetFields.filter(f => f.required).length;
  const satisfiedRequired = totalRequired - missingRequiredFields.length;

  return {
    isValid,
    canProceed,
    totalErrors: errors.length,
    criticalErrorsCount,
    totalWarnings: warnings.length,
    errors,
    warnings,
    missingRequiredFields,
    duplicateTargetAlerts,
    typeWarnings,
    metrics: {
      totalRequired,
      satisfiedRequired,
      missingRequiredCount: missingRequiredFields.length,
      duplicateCount: duplicateTargetAlerts.length,
      warningCount: warnings.length
    }
  };
}
