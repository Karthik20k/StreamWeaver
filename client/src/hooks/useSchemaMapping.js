import { useState, useEffect, useMemo, useCallback } from 'react';
import { PREDEFINED_TARGET_SCHEMAS } from '../utils/targetSchemas';
import { performSmartAutoMatch } from '../utils/autoMapper';
import { validateMappingConfig } from '../utils/configValidator';
import { getDefaultRuleForTarget, DEFAULT_TRANSFORMATION_RULE } from '../utils/transformationRules';
import { inferColumnTypes } from '../utils/columnAutoSizer';

export function useSchemaMapping({
  sourceHeaders = [],
  sampleRows = [],
  initialSchemaId = 'ecommerce_orders',
  apiEndpoint = '/api/schemas'
} = {}) {
  const [schemas, setSchemas] = useState(PREDEFINED_TARGET_SCHEMAS);
  const [selectedSchemaId, setSelectedSchemaId] = useState(initialSchemaId);
  const [mappings, setMappings] = useState({});
  const [transformations, setTransformations] = useState({});
  const [autoMatchReport, setAutoMatchReport] = useState(null);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [apiError, setApiError] = useState(null);

  // Inferred column types for compatibility analysis
  const inferredTypes = useMemo(() => {
    return inferColumnTypes(sourceHeaders, sampleRows);
  }, [sourceHeaders, sampleRows]);

  // Fetch target schemas from Dev 2's API on mount, fallback cleanly to local schemas
  useEffect(() => {
    let isMounted = true;
    const fetchSchemas = async () => {
      setIsLoadingSchemas(true);
      setApiError(null);
      try {
        const res = await fetch(apiEndpoint);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data?.schemas?.length) {
            setSchemas(data.schemas);
          }
        }
      } catch (err) {
        if (isMounted) {
          setApiError(err.message);
        }
      } finally {
        if (isMounted) {
          setIsLoadingSchemas(false);
        }
      }
    };

    fetchSchemas();
    return () => {
      isMounted = false;
    };
  }, [apiEndpoint]);

  // Current active target schema object
  const activeSchema = useMemo(() => {
    return schemas.find((s) => s.id === selectedSchemaId) || schemas[0] || PREDEFINED_TARGET_SCHEMAS[0];
  }, [schemas, selectedSchemaId]);

  const targetFields = useMemo(() => {
    return activeSchema?.fields || [];
  }, [activeSchema]);

  // Reverse mapping lookup: { [targetField]: sourceColumn }
  const reverseMappings = useMemo(() => {
    const rev = {};
    for (const [src, tgt] of Object.entries(mappings)) {
      if (tgt) {
        rev[tgt] = src;
      }
    }
    return rev;
  }, [mappings]);

  // Helper to get target field definition by name
  const getTargetFieldByName = useCallback((fieldName) => {
    return targetFields.find((f) => f.name === fieldName) || null;
  }, [targetFields]);

  // Automatically seed initial mappings and default transformation rules if empty
  useEffect(() => {
    if (sourceHeaders && sourceHeaders.length > 0 && targetFields && targetFields.length > 0) {
      setMappings((prevMappings) => {
        if (Object.keys(prevMappings).length === 0) {
          const result = performSmartAutoMatch(sourceHeaders, targetFields);
          
          // Seed transformation rules for automatically mapped fields
          setTransformations((prevTransforms) => {
            const nextTransforms = { ...prevTransforms };
            for (const [srcCol, tgtName] of Object.entries(result.mappings)) {
              if (!nextTransforms[srcCol]) {
                const targetDef = targetFields.find((f) => f.name === tgtName);
                nextTransforms[srcCol] = getDefaultRuleForTarget(targetDef);
              }
            }
            return nextTransforms;
          });

          return result.mappings;
        }
        return prevMappings;
      });
    }
  }, [sourceHeaders, targetFields]);

  // Set or update a single mapping pair: sourceColumn -> targetField
  const setMapping = useCallback((sourceCol, targetField) => {
    if (!sourceCol) return;

    setMappings((prev) => {
      const next = { ...prev };

      // If assigning to empty/null, remove mapping and rule
      if (!targetField) {
        delete next[sourceCol];
        setTransformations((tPrev) => {
          const tNext = { ...tPrev };
          delete tNext[sourceCol];
          return tNext;
        });
        return next;
      }

      // If another source column was already mapped to this targetField, unbind it to prevent collision
      for (const [src, tgt] of Object.entries(next)) {
        if (tgt === targetField && src !== sourceCol) {
          delete next[src];
          setTransformations((tPrev) => {
            const tNext = { ...tPrev };
            delete tNext[src];
            return tNext;
          });
        }
      }

      next[sourceCol] = targetField;

      // Assign default transformation rules tailored to target field type
      setTransformations((tPrev) => {
        if (!tPrev[sourceCol]) {
          const targetDef = getTargetFieldByName(targetField);
          return {
            ...tPrev,
            [sourceCol]: getDefaultRuleForTarget(targetDef)
          };
        }
        return tPrev;
      });

      return next;
    });
  }, [getTargetFieldByName]);

  // Remove mapping for a specific source column
  const removeMapping = useCallback((sourceCol) => {
    if (!sourceCol) return;
    setMappings((prev) => {
      const next = { ...prev };
      delete next[sourceCol];
      return next;
    });
    setTransformations((prev) => {
      const next = { ...prev };
      delete next[sourceCol];
      return next;
    });
  }, []);

  // Unmap by target field
  const removeMappingByTarget = useCallback((targetField) => {
    if (!targetField) return;
    setMappings((prev) => {
      const next = { ...prev };
      for (const [src, tgt] of Object.entries(next)) {
        if (tgt === targetField) {
          delete next[src];
          setTransformations((tPrev) => {
            const tNext = { ...tPrev };
            delete tNext[src];
            return tNext;
          });
        }
      }
      return next;
    });
  }, []);

  // Resolve duplicate collision by keeping only one source column mapped to the target
  const resolveDuplicate = useCallback((targetFieldName, sourceColToKeep) => {
    setMappings((prev) => {
      const next = { ...prev };
      for (const [src, tgt] of Object.entries(next)) {
        if (tgt === targetFieldName && src !== sourceColToKeep) {
          delete next[src];
        }
      }
      next[sourceColToKeep] = targetFieldName;
      return next;
    });
  }, []);

  // Clear all current active mappings and rules
  const clearAllMappings = useCallback(() => {
    setMappings({});
    setTransformations({});
    setAutoMatchReport(null);
  }, []);

  // Trigger automated matching algorithm with smart defaults and report
  const autoMapAll = useCallback((options = {}) => {
    const result = performSmartAutoMatch(sourceHeaders, targetFields, options);
    setMappings(result.mappings);

    // Initialize rules for newly auto-mapped fields
    const nextTransforms = {};
    for (const [srcCol, tgtName] of Object.entries(result.mappings)) {
      const targetDef = targetFields.find((f) => f.name === tgtName);
      nextTransforms[srcCol] = getDefaultRuleForTarget(targetDef);
    }
    setTransformations(nextTransforms);
    setAutoMatchReport(result);
    return result;
  }, [sourceHeaders, targetFields]);

  // Dismiss auto match report modal
  const clearAutoMatchReport = useCallback(() => {
    setAutoMatchReport(null);
  }, []);

  // Update transformation rules for a specific source column
  const setTransformation = useCallback((sourceCol, ruleUpdates) => {
    if (!sourceCol) return;
    setTransformations((prev) => {
      const existing = prev[sourceCol] || DEFAULT_TRANSFORMATION_RULE;
      return {
        ...prev,
        [sourceCol]: {
          ...existing,
          ...ruleUpdates
        }
      };
    });
  }, []);

  // Reset rules for a column back to default
  const resetTransformation = useCallback((sourceCol) => {
    const tgtName = mappings[sourceCol];
    const targetDef = getTargetFieldByName(tgtName);
    const defaults = getDefaultRuleForTarget(targetDef);
    setTransformations((prev) => ({
      ...prev,
      [sourceCol]: defaults
    }));
  }, [mappings, getTargetFieldByName]);

  // Get active transformation rule for a source column
  const getTransformation = useCallback((sourceCol) => {
    if (transformations[sourceCol]) {
      return transformations[sourceCol];
    }
    const tgtName = mappings[sourceCol];
    const targetDef = getTargetFieldByName(tgtName);
    return getDefaultRuleForTarget(targetDef);
  }, [transformations, mappings, getTargetFieldByName]);

  // When changing target schema, clean up invalid mappings
  const handleSelectSchema = useCallback((schemaId) => {
    setSelectedSchemaId(schemaId);
    const targetSchema = schemas.find((s) => s.id === schemaId);
    if (targetSchema) {
      const result = performSmartAutoMatch(sourceHeaders, targetSchema.fields);
      setMappings(result.mappings);

      const nextTransforms = {};
      for (const [srcCol, tgtName] of Object.entries(result.mappings)) {
        const targetDef = targetSchema.fields.find((f) => f.name === tgtName);
        nextTransforms[srcCol] = getDefaultRuleForTarget(targetDef);
      }
      setTransformations(nextTransforms);
      setAutoMatchReport(result);
    }
  }, [schemas, sourceHeaders]);

  // Comprehensive Pre-Upload Validation Checker (Day 3 Requirement)
  const validation = useMemo(() => {
    return validateMappingConfig(mappings, targetFields, sourceHeaders, inferredTypes);
  }, [mappings, targetFields, sourceHeaders, inferredTypes]);

  // Mapping statistics and validation metrics
  const stats = useMemo(() => {
    const totalSource = sourceHeaders.length;
    const totalTarget = targetFields.length;
    const mappedEntries = Object.entries(mappings).filter(([src, tgt]) => Boolean(tgt));
    const mappedCount = mappedEntries.length;
    const unmappedSourceCount = Math.max(0, totalSource - mappedCount);

    const requiredFields = targetFields.filter((f) => f.required);
    const missingRequired = validation.missingRequiredFields;
    const mappedRequiredCount = requiredFields.length - missingRequired.length;
    const isAllRequiredMapped = validation.isValid;

    const completionPercentage = totalTarget > 0 
      ? Math.round((mappedCount / totalTarget) * 100) 
      : 0;

    const totalRulesConfigured = Object.keys(transformations).length;

    return {
      totalSource,
      totalTarget,
      mappedCount,
      unmappedSourceCount,
      requiredCount: requiredFields.length,
      mappedRequiredCount,
      unmappedRequiredCount: missingRequired.length,
      missingRequiredFields: missingRequired,
      isAllRequiredMapped,
      completionPercentage,
      totalRulesConfigured
    };
  }, [sourceHeaders, targetFields, mappings, transformations, validation]);

  // Export clean config payload for Day 4 upload and Dev 1 transformer
  const exportConfig = useCallback(() => {
    return {
      schemaId: activeSchema.id,
      targetCollection: activeSchema.targetCollection,
      mappingRules: { ...mappings },
      transformRules: { ...transformations },
      validation: {
        isValid: validation.isValid,
        canProceed: validation.canProceed,
        errors: validation.errors,
        warnings: validation.warnings
      },
      metadata: {
        totalSourceHeaders: sourceHeaders.length,
        totalTargetFields: targetFields.length,
        mappedPairsCount: Object.keys(mappings).length,
        allRequiredMapped: validation.isValid,
        generatedAt: new Date().toISOString()
      }
    };
  }, [activeSchema, mappings, transformations, validation, sourceHeaders, targetFields]);

  return {
    schemas,
    selectedSchemaId,
    activeSchema,
    targetFields,
    mappings,
    reverseMappings,
    transformations,
    inferredTypes,
    autoMatchReport,
    validation,
    isLoadingSchemas,
    apiError,
    setSelectedSchemaId: handleSelectSchema,
    setMapping,
    removeMapping,
    removeMappingByTarget,
    resolveDuplicate,
    clearAllMappings,
    autoMapAll,
    clearAutoMatchReport,
    setTransformation,
    resetTransformation,
    getTransformation,
    stats,
    exportConfig
  };
}
