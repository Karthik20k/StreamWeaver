import { useState, useEffect, useMemo, useCallback } from 'react';
import { PREDEFINED_TARGET_SCHEMAS, calculateAutoMappings } from '../utils/targetSchemas';

export function useSchemaMapping({
  sourceHeaders = [],
  sampleRows = [],
  initialSchemaId = 'ecommerce_orders',
  apiEndpoint = '/api/schemas'
} = {}) {
  const [schemas, setSchemas] = useState(PREDEFINED_TARGET_SCHEMAS);
  const [selectedSchemaId, setSelectedSchemaId] = useState(initialSchemaId);
  const [mappings, setMappings] = useState({});
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [apiError, setApiError] = useState(null);

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
        // Dev 2 server may not be running yet or running on another port in dev
        if (isMounted) {
          setApiError(err.message);
          // Keep predefined schemas as stable fallback
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

  // Automatically seed initial mappings if headers match current target schema
  useEffect(() => {
    if (sourceHeaders && sourceHeaders.length > 0 && targetFields && targetFields.length > 0) {
      // If no mappings currently set, perform initial auto-mapping
      setMappings((prev) => {
        if (Object.keys(prev).length === 0) {
          return calculateAutoMappings(sourceHeaders, targetFields);
        }
        return prev;
      });
    }
  }, [sourceHeaders, targetFields]);

  // Set or update a single mapping pair: sourceColumn -> targetField
  const setMapping = useCallback((sourceCol, targetField) => {
    if (!sourceCol) return;

    setMappings((prev) => {
      const next = { ...prev };

      // If assigning to empty/null, remove mapping
      if (!targetField) {
        delete next[sourceCol];
        return next;
      }

      // If another source column was already mapped to this targetField, unbind it to prevent collision
      for (const [src, tgt] of Object.entries(next)) {
        if (tgt === targetField && src !== sourceCol) {
          delete next[src];
        }
      }

      next[sourceCol] = targetField;
      return next;
    });
  }, []);

  // Remove mapping for a specific source column
  const removeMapping = useCallback((sourceCol) => {
    if (!sourceCol) return;
    setMappings((prev) => {
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
        }
      }
      return next;
    });
  }, []);

  // Clear all current active mappings
  const clearAllMappings = useCallback(() => {
    setMappings({});
  }, []);

  // Trigger automated matching algorithm
  const autoMapAll = useCallback(() => {
    const auto = calculateAutoMappings(sourceHeaders, targetFields);
    setMappings(auto);
    return auto;
  }, [sourceHeaders, targetFields]);

  // When changing target schema, clean up invalid mappings
  const handleSelectSchema = useCallback((schemaId) => {
    setSelectedSchemaId(schemaId);
    const targetSchema = schemas.find((s) => s.id === schemaId);
    if (targetSchema) {
      const validTargetNames = new Set(targetSchema.fields.map((f) => f.name));
      // Re-map with new schema
      const auto = calculateAutoMappings(sourceHeaders, targetSchema.fields);
      setMappings(auto);
    }
  }, [schemas, sourceHeaders]);

  // Mapping statistics and validation metrics
  const stats = useMemo(() => {
    const totalSource = sourceHeaders.length;
    const totalTarget = targetFields.length;
    const mappedEntries = Object.entries(mappings).filter(([src, tgt]) => Boolean(tgt));
    const mappedCount = mappedEntries.length;
    const unmappedSourceCount = Math.max(0, totalSource - mappedCount);

    const requiredFields = targetFields.filter((f) => f.required);
    const mappedTargetNames = new Set(Object.values(mappings));
    
    const missingRequired = requiredFields.filter((f) => !mappedTargetNames.has(f.name));
    const mappedRequiredCount = requiredFields.length - missingRequired.length;
    const isAllRequiredMapped = missingRequired.length === 0;

    const completionPercentage = totalTarget > 0 
      ? Math.round((mappedCount / totalTarget) * 100) 
      : 0;

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
      completionPercentage
    };
  }, [sourceHeaders, targetFields, mappings]);

  // Export clean config payload for Day 4 upload and Dev 1 transformer
  const exportConfig = useCallback(() => {
    return {
      schemaId: activeSchema.id,
      targetCollection: activeSchema.targetCollection,
      mappingRules: { ...mappings },
      metadata: {
        totalSourceHeaders: sourceHeaders.length,
        totalTargetFields: targetFields.length,
        mappedPairsCount: Object.keys(mappings).length,
        allRequiredMapped: stats.isAllRequiredMapped,
        generatedAt: new Date().toISOString()
      }
    };
  }, [activeSchema, mappings, sourceHeaders, targetFields, stats]);

  return {
    schemas,
    selectedSchemaId,
    activeSchema,
    targetFields,
    mappings,
    reverseMappings,
    isLoadingSchemas,
    apiError,
    setSelectedSchemaId: handleSelectSchema,
    setMapping,
    removeMapping,
    removeMappingByTarget,
    clearAllMappings,
    autoMapAll,
    stats,
    exportConfig
  };
}
