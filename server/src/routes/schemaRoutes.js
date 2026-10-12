const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { TargetSchema, DeadLetterQueue } = require('../models');
const { PREDEFINED_SCHEMAS } = require('../config/predefinedSchemas');
const { validateRow, createDLQRecords } = require('../pipeline/validationEngine');

/**
 * Helper to check if MongoDB is connected
 */
function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * GET /api/schemas/predefined
 * Fetch all predefined target schemas for Dev 3's UI.
 */
router.get('/predefined', async (req, res) => {
  try {
    if (isDbConnected()) {
      const dbSchemas = await TargetSchema.find({ isPredefined: true }).lean();
      if (dbSchemas && dbSchemas.length > 0) {
        return res.status(200).json({
          success: true,
          count: dbSchemas.length,
          source: 'database',
          data: dbSchemas
        });
      }
    }

    // Return in-memory predefined templates if DB is empty or offline
    return res.status(200).json({
      success: true,
      count: PREDEFINED_SCHEMAS.length,
      source: 'memory_fallback',
      data: PREDEFINED_SCHEMAS
    });
  } catch (error) {
    console.error('[SchemaRoutes] Error fetching predefined schemas:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch predefined schemas',
      error: error.message
    });
  }
});

/**
 * POST /api/schemas/seed
 * Seeds or updates predefined schemas in the database.
 */
router.post('/seed', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        success: false,
        message: 'MongoDB is not currently connected. Predefined schemas remain available in memory.'
      });
    }

    const seeded = [];
    for (const schemaDef of PREDEFINED_SCHEMAS) {
      const doc = await TargetSchema.findOneAndUpdate(
        { name: schemaDef.name },
        { ...schemaDef, isPredefined: true },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      seeded.push(doc);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully seeded ${seeded.length} predefined target schemas`,
      data: seeded
    });
  } catch (error) {
    console.error('[SchemaRoutes] Error seeding schemas:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to seed predefined schemas',
      error: error.message
    });
  }
});

/**
 * POST /api/schemas/validate
 * Validates a sample row or batch of rows against a target schema definition.
 * Returns validation outcome, detailed errors, and generated DLQ records preview.
 */
router.post('/validate', async (req, res) => {
  try {
    const { schemaId, schema: inlineSchema, row, rows, jobId = 'job_preview' } = req.body;

    let targetSchemaDef = inlineSchema;

    if (!targetSchemaDef && schemaId) {
      if (isDbConnected()) {
        const query = mongoose.Types.ObjectId.isValid(schemaId) ? { _id: schemaId } : { name: schemaId };
        targetSchemaDef = await TargetSchema.findOne(query).lean();
      }
      if (!targetSchemaDef) {
        targetSchemaDef = PREDEFINED_SCHEMAS.find(
          (s) => s.name.toLowerCase() === String(schemaId).toLowerCase()
        );
      }
    }

    if (!targetSchemaDef || !Array.isArray(targetSchemaDef.fields)) {
      return res.status(400).json({
        success: false,
        message: 'Valid target schema (schemaId or schema object with fields array) is required'
      });
    }

    const testRows = Array.isArray(rows) ? rows : row ? [row] : [];
    if (testRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one row or rows array is required for validation testing'
      });
    }

    let validCount = 0;
    let invalidCount = 0;
    const results = [];
    const dlqRecords = [];

    testRows.forEach((r, idx) => {
      const rowNumber = idx + 1;
      const valResult = validateRow(r, targetSchemaDef);

      if (valResult.isValid) {
        validCount++;
        results.push({
          rowNumber,
          isValid: true,
          sanitized: valResult.sanitized
        });
      } else {
        invalidCount++;
        results.push({
          rowNumber,
          isValid: false,
          errors: valResult.errors,
          rawRow: r
        });

        const dlqEntries = createDLQRecords({
          jobId,
          rowNumber,
          rawData: r,
          errors: valResult.errors
        });
        dlqRecords.push(...dlqEntries);
      }
    });

    return res.status(200).json({
      success: true,
      totalRows: testRows.length,
      validCount,
      invalidCount,
      isValid: invalidCount === 0,
      results,
      dlqPreview: dlqRecords
    });
  } catch (error) {
    console.error('[SchemaRoutes] Validation execution error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to execute validation',
      error: error.message
    });
  }
});

/**
 * GET /api/schemas/dlq/:jobId?
 * Query DeadLetterQueue records recorded during ingestion or validation.
 */
router.get('/dlq/:jobId?', async (req, res) => {
  try {
    const jobId = req.params.jobId || req.query.jobId;
    const { failedField, limit = 100, page = 1 } = req.query;

    if (!isDbConnected()) {
      return res.status(200).json({
        success: true,
        source: 'memory_fallback',
        count: 0,
        data: [],
        message: 'MongoDB offline; no persisted DLQ records found.'
      });
    }

    const filter = {};
    if (jobId) filter.jobId = jobId;
    if (failedField) filter.failedField = failedField;

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [records, total] = await Promise.all([
      DeadLetterQueue.find(filter)
        .sort({ timestamp: -1, rowNumber: 1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      DeadLetterQueue.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: Number(page),
      limit: Number(limit),
      data: records
    });
  } catch (error) {
    console.error('[SchemaRoutes] Error retrieving DLQ records:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve DLQ records',
      error: error.message
    });
  }
});

/**
 * POST /api/schemas/dlq
 * Manually or programmatically push rejected records into the DeadLetterQueue.
 */
router.post('/dlq', async (req, res) => {
  try {
    const {
      jobId,
      fileId,
      rowNumber,
      rawData,
      rawRow,
      rejectedReason,
      errorMessage,
      errorType,
      failedField,
      details,
      stackTrace,
      stack,
      sandboxError
    } = req.body;

    const reason = rejectedReason || errorMessage || (sandboxError && sandboxError.message) || 'Record rejected';

    if (!jobId || rowNumber === undefined || !reason) {
      return res.status(400).json({
        success: false,
        message: 'jobId, rowNumber, and rejectedReason are required fields for DLQ entry'
      });
    }

    const resolvedErrorType = errorType || (sandboxError ? 'SANDBOX_EXECUTION_FAILED' : (failedField ? 'VALIDATION_FAILED' : 'MALFORMED_ROW'));
    const resolvedStackTrace = stackTrace || stack || (sandboxError && sandboxError.stack) || null;
    const resolvedDetails = details || (sandboxError ? { sandboxError } : (failedField ? { failedField } : null));

    if (!isDbConnected()) {
      const mockRecord = {
        jobId,
        fileId: fileId || null,
        rowNumber: Number(rowNumber),
        rawData: rawData !== undefined ? rawData : (rawRow !== undefined ? rawRow : null),
        rawRow: rawRow !== undefined ? rawRow : (rawData !== undefined ? rawData : null),
        rejectedReason: reason,
        errorMessage: errorMessage || reason,
        errorType: resolvedErrorType,
        failedField: failedField || null,
        details: resolvedDetails,
        stackTrace: resolvedStackTrace,
        timestamp: new Date(),
        createdAt: new Date()
      };
      return res.status(201).json({
        success: true,
        message: 'DLQ record recorded (memory simulation)',
        data: mockRecord
      });
    }

    const record = new DeadLetterQueue({
      jobId,
      fileId: fileId || null,
      rowNumber: Number(rowNumber),
      rawData: rawData !== undefined ? rawData : (rawRow !== undefined ? rawRow : null),
      rawRow: rawRow !== undefined ? rawRow : (rawData !== undefined ? rawData : null),
      rejectedReason: reason,
      errorMessage: errorMessage || reason,
      errorType: resolvedErrorType,
      failedField: failedField || null,
      details: resolvedDetails,
      stackTrace: resolvedStackTrace,
      timestamp: new Date()
    });

    const saved = await record.save();

    return res.status(201).json({
      success: true,
      message: 'DLQ error record saved successfully',
      data: saved
    });
  } catch (error) {
    console.error('[SchemaRoutes] Error saving DLQ record:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save DLQ record',
      error: error.message
    });
  }
});

/**
 * GET /api/schemas
 * List all target schemas with optional query filters (search, category, isPredefined, isActive).
 */
router.get('/', async (req, res) => {
  try {
    const { category, search, isPredefined, isActive } = req.query;

    if (isDbConnected()) {
      const filter = {};
      if (category) filter.category = category;
      if (isPredefined !== undefined) filter.isPredefined = isPredefined === 'true';
      if (isActive !== undefined) filter.isActive = isActive === 'true';
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      const schemas = await TargetSchema.find(filter).sort({ isPredefined: -1, createdAt: -1 }).lean();

      // If DB has schemas, return them
      if (schemas.length > 0) {
        return res.status(200).json({
          success: true,
          count: schemas.length,
          data: schemas
        });
      }
    }

    // Fallback: Filter in-memory predefined schemas
    let list = [...PREDEFINED_SCHEMAS];
    if (category) {
      list = list.filter((s) => s.category.toLowerCase() === category.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
    }

    return res.status(200).json({
      success: true,
      count: list.length,
      source: 'memory_fallback',
      data: list
    });
  } catch (error) {
    console.error('[SchemaRoutes] Error listing schemas:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch target schemas',
      error: error.message
    });
  }
});

/**
 * GET /api/schemas/:id
 * Fetch a target schema by MongoDB ObjectId or schema name.
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (isDbConnected()) {
      let schema;
      if (mongoose.Types.ObjectId.isValid(id)) {
        schema = await TargetSchema.findById(id).lean();
      }
      if (!schema) {
        schema = await TargetSchema.findOne({ name: id }).lean();
      }
      if (schema) {
        return res.status(200).json({
          success: true,
          data: schema
        });
      }
    }

    // Fallback search in predefined templates
    const fallback = PREDEFINED_SCHEMAS.find((s) => s.name.toLowerCase() === id.toLowerCase());
    if (fallback) {
      return res.status(200).json({
        success: true,
        source: 'memory_fallback',
        data: fallback
      });
    }

    return res.status(404).json({
      success: false,
      message: `Target schema not found with identifier: '${id}'`
    });
  } catch (error) {
    console.error('[SchemaRoutes] Error retrieving schema:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve schema',
      error: error.message
    });
  }
});

/**
 * POST /api/schemas
 * Create and save a new target schema.
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, fields, category, version, isActive, isPredefined } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Schema name is required and must be a non-empty string'
      });
    }

    if (!Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one field definition is required in fields array'
      });
    }

    // Check for duplicate field names
    const fieldNames = fields.map((f) => (f && f.name ? f.name.trim().toLowerCase() : '')).filter(Boolean);
    if (new Set(fieldNames).size !== fieldNames.length) {
      return res.status(400).json({
        success: false,
        message: 'Field names within target schema must be unique'
      });
    }

    if (!isDbConnected()) {
      // Memory mock response if database offline
      const mockCreated = {
        _id: new mongoose.Types.ObjectId(),
        name: name.trim(),
        description: description || '',
        category: category || 'Custom',
        version: version || 1,
        fields,
        isActive: isActive !== undefined ? isActive : true,
        isPredefined: Boolean(isPredefined),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      return res.status(201).json({
        success: true,
        message: 'Schema saved (memory fallback mode)',
        data: mockCreated
      });
    }

    const existing = await TargetSchema.findOne({ name: name.trim() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A target schema named '${name.trim()}' already exists`
      });
    }

    const newSchema = new TargetSchema({
      name: name.trim(),
      description: description || '',
      category: category || 'Custom',
      version: version || 1,
      fields,
      isActive: isActive !== undefined ? isActive : true,
      isPredefined: Boolean(isPredefined)
    });

    const saved = await newSchema.save();

    return res.status(201).json({
      success: true,
      message: 'Target schema created successfully',
      data: saved
    });
  } catch (error) {
    console.error('[SchemaRoutes] Error creating schema:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Schema validation error',
        errors: Object.values(error.errors).map((e) => e.message)
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to create target schema',
      error: error.message
    });
  }
});

/**
 * PUT /api/schemas/:id
 * Update an existing target schema.
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, fields, category, version, isActive, isPredefined } = req.body;

    if (!isDbConnected()) {
      return res.status(200).json({
        success: true,
        message: 'Target schema updated (simulated mode)',
        data: { id, name, description, fields, category }
      });
    }

    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { name: id };
    const schemaDoc = await TargetSchema.findOne(query);

    if (!schemaDoc) {
      return res.status(404).json({
        success: false,
        message: `Target schema not found with identifier: '${id}'`
      });
    }

    if (name) schemaDoc.name = name.trim();
    if (description !== undefined) schemaDoc.description = description;
    if (category !== undefined) schemaDoc.category = category;
    if (version !== undefined) schemaDoc.version = version;
    if (isActive !== undefined) schemaDoc.isActive = isActive;
    if (isPredefined !== undefined) schemaDoc.isPredefined = isPredefined;
    if (fields) {
      if (!Array.isArray(fields) || fields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'fields must be a non-empty array'
        });
      }
      schemaDoc.fields = fields;
    }

    const updated = await schemaDoc.save();

    return res.status(200).json({
      success: true,
      message: 'Target schema updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('[SchemaRoutes] Error updating schema:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update target schema',
      error: error.message
    });
  }
});

/**
 * DELETE /api/schemas/:id
 * Delete or deactivate a target schema.
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const hardDelete = req.query.hard === 'true';

    if (!isDbConnected()) {
      return res.status(200).json({
        success: true,
        message: `Schema '${id}' removed (simulated mode)`
      });
    }

    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { name: id };

    if (hardDelete) {
      const deleted = await TargetSchema.findOneAndDelete(query);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: `Target schema not found: '${id}'`
        });
      }
      return res.status(200).json({
        success: true,
        message: `Target schema '${deleted.name}' permanently deleted`
      });
    }

    // Soft delete / deactivation
    const deactivated = await TargetSchema.findOneAndUpdate(
      query,
      { isActive: false },
      { new: true }
    );

    if (!deactivated) {
      return res.status(404).json({
        success: false,
        message: `Target schema not found: '${id}'`
      });
    }

    return res.status(200).json({
      success: true,
      message: `Target schema '${deactivated.name}' marked inactive`,
      data: deactivated
    });
  } catch (error) {
    console.error('[SchemaRoutes] Error deleting schema:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete target schema',
      error: error.message
    });
  }
});

module.exports = router;
