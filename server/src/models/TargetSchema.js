const mongoose = require('mongoose');
const { validateRow } = require('../pipeline/validationEngine');

/**
 * FieldConstraintSchema:
 * Constraints applied to individual target fields (required, unique, default).
 */
const FieldConstraintSchema = new mongoose.Schema(
  {
    required: {
      type: Boolean,
      default: false
    },
    unique: {
      type: Boolean,
      default: false
    },
    defaultValue: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined
    },
    pattern: {
      type: String,
      trim: true,
      default: null
    },
    regex: {
      type: String,
      trim: true,
      default: null
    },
    min: {
      type: Number,
      default: null
    },
    max: {
      type: Number,
      default: null
    },
    allowedValues: {
      type: [mongoose.Schema.Types.Mixed],
      default: undefined
    }
  },
  { _id: false }
);

/**
 * FieldDefinitionSchema:
 * Defines each target schema attribute, its data type, and validation constraints.
 */
const FieldDefinitionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Field name is required'],
      trim: true
    },
    type: {
      type: String,
      required: [true, 'Field type is required'],
      enum: {
        values: ['String', 'Number', 'Date', 'Boolean', 'Mixed'],
        message: '{VALUE} is not a valid field type. Allowed types: String, Number, Date, Boolean, Mixed.'
      },
      default: 'String'
    },
    constraints: {
      type: FieldConstraintSchema,
      default: () => ({ required: false, unique: false })
    },
    description: {
      type: String,
      trim: true,
      default: ''
    }
  },
  { _id: false }
);

/**
 * TargetSchema:
 * Stores target field definitions, types (String, Number, Date), and constraints (required, unique).
 * Used by StreamWeaver for ETL mapping, data cleaning, and validation before writing to destination collections.
 */
const TargetSchemaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Schema name is required'],
      unique: true,
      trim: true,
      index: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    version: {
      type: Number,
      default: 1,
      min: 1
    },
    fields: {
      type: [FieldDefinitionSchema],
      required: [true, 'At least one field definition is required'],
      validate: [
        {
          validator: function (fields) {
            return Array.isArray(fields) && fields.length > 0;
          },
          message: 'Target schema must contain at least one field definition.'
        },
        {
          validator: function (fields) {
            if (!Array.isArray(fields)) return true;
            const names = fields.map((f) => (f && f.name ? f.name.toLowerCase().trim() : '')).filter(Boolean);
            return new Set(names).size === names.length;
          },
          message: 'Field names within a target schema must be unique.'
        }
      ]
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    isPredefined: {
      type: Boolean,
      default: false,
      index: true
    },
    category: {
      type: String,
      trim: true,
      default: 'General'
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

/**
 * Validates and transforms a single record against the defined target schema fields and constraints.
 *
 * @param {Record<string, any>} row - Key-value pair of row data
 * @returns {{ isValid: boolean, errors: string[], errorDetails: Array<{field: string, reason: string}>, sanitized: Record<string, any> }}
 */
TargetSchemaSchema.methods.validateRow = function (row) {
  const result = validateRow(row, this);
  return {
    isValid: result.isValid,
    errors: result.errors.map(err => err.reason),
    errorDetails: result.errors,
    sanitized: result.sanitized
  };
};

const TargetSchema = mongoose.models.TargetSchema || mongoose.model('TargetSchema', TargetSchemaSchema);

module.exports = TargetSchema;
