const mongoose = require('mongoose');

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
 * @returns {{ isValid: boolean, errors: string[], sanitized: Record<string, any> }}
 */
TargetSchemaSchema.methods.validateRow = function (row) {
  const errors = [];
  const sanitized = {};

  for (const field of this.fields) {
    const rawVal = row ? row[field.name] : undefined;
    const isRequired = Boolean(field.constraints && field.constraints.required);
    const isPresent = rawVal !== undefined && rawVal !== null && rawVal !== '';

    if (isRequired && !isPresent) {
      errors.push(`Field '${field.name}' is required but was empty or missing.`);
      continue;
    }

    if (!isPresent) {
      if (field.constraints && field.constraints.defaultValue !== undefined) {
        sanitized[field.name] = field.constraints.defaultValue;
      }
      continue;
    }

    switch (field.type) {
      case 'String': {
        sanitized[field.name] = String(rawVal);
        break;
      }
      case 'Number': {
        const num = Number(rawVal);
        if (Number.isNaN(num)) {
          errors.push(`Field '${field.name}' expected Number, received: '${rawVal}'`);
        } else {
          sanitized[field.name] = num;
        }
        break;
      }
      case 'Date': {
        const date = new Date(rawVal);
        if (Number.isNaN(date.getTime())) {
          errors.push(`Field '${field.name}' expected valid Date, received: '${rawVal}'`);
        } else {
          sanitized[field.name] = date;
        }
        break;
      }
      case 'Boolean': {
        if (typeof rawVal === 'boolean') {
          sanitized[field.name] = rawVal;
        } else if (typeof rawVal === 'string') {
          const lower = rawVal.trim().toLowerCase();
          if (['true', '1', 'yes'].includes(lower)) sanitized[field.name] = true;
          else if (['false', '0', 'no'].includes(lower)) sanitized[field.name] = false;
          else errors.push(`Field '${field.name}' expected Boolean, received: '${rawVal}'`);
        } else {
          sanitized[field.name] = Boolean(rawVal);
        }
        break;
      }
      case 'Mixed':
      default:
        sanitized[field.name] = rawVal;
        break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
};

const TargetSchema = mongoose.models.TargetSchema || mongoose.model('TargetSchema', TargetSchemaSchema);

module.exports = TargetSchema;
