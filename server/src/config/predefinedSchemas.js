/**
 * Predefined Target Schemas for Dev 3's UI
 * Industry-standard templates with rich field types, regex patterns, and range constraints.
 */

const PREDEFINED_SCHEMAS = [
  {
    name: 'CustomerOrders',
    description: 'E-commerce and retail customer order processing schema',
    category: 'E-Commerce',
    version: 1,
    isPredefined: true,
    isActive: true,
    fields: [
      {
        name: 'orderId',
        type: 'String',
        description: 'Unique alphanumeric order identifier',
        constraints: {
          required: true,
          unique: true,
          pattern: 'identifier',
          min: 4,
          max: 30
        }
      },
      {
        name: 'customerEmail',
        type: 'String',
        description: 'Customer contact email address',
        constraints: {
          required: true,
          pattern: 'email'
        }
      },
      {
        name: 'customerPhone',
        type: 'String',
        description: 'Customer contact phone number',
        constraints: {
          required: false,
          pattern: 'phone'
        }
      },
      {
        name: 'amount',
        type: 'Number',
        description: 'Total order dollar value',
        constraints: {
          required: true,
          min: 0.01,
          max: 1000000
        }
      },
      {
        name: 'quantity',
        type: 'Number',
        description: 'Item count in the order',
        constraints: {
          required: true,
          min: 1,
          max: 10000,
          defaultValue: 1
        }
      },
      {
        name: 'status',
        type: 'String',
        description: 'Order fulfillment status',
        constraints: {
          required: true,
          allowedValues: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
          defaultValue: 'pending'
        }
      },
      {
        name: 'orderDate',
        type: 'Date',
        description: 'Timestamp when order was placed',
        constraints: {
          required: false
        }
      }
    ]
  },
  {
    name: 'UserProfiles',
    description: 'User identity, authentication, and contact directory schema',
    category: 'CRM & Users',
    version: 1,
    isPredefined: true,
    isActive: true,
    fields: [
      {
        name: 'userId',
        type: 'String',
        description: 'Global unique user ID',
        constraints: {
          required: true,
          unique: true,
          min: 3,
          max: 64
        }
      },
      {
        name: 'email',
        type: 'String',
        description: 'Primary verified email address',
        constraints: {
          required: true,
          unique: true,
          pattern: 'email'
        }
      },
      {
        name: 'fullName',
        type: 'String',
        description: 'Full display name',
        constraints: {
          required: true,
          min: 2,
          max: 120
        }
      },
      {
        name: 'phoneNumber',
        type: 'String',
        description: 'Primary mobile or work phone number',
        constraints: {
          required: false,
          pattern: 'phone'
        }
      },
      {
        name: 'age',
        type: 'Number',
        description: 'User age in years',
        constraints: {
          required: false,
          min: 13,
          max: 120
        }
      },
      {
        name: 'role',
        type: 'String',
        description: 'System access role',
        constraints: {
          required: true,
          allowedValues: ['admin', 'manager', 'editor', 'user', 'guest'],
          defaultValue: 'user'
        }
      },
      {
        name: 'isActive',
        type: 'Boolean',
        description: 'Account activation status',
        constraints: {
          required: false,
          defaultValue: true
        }
      }
    ]
  },
  {
    name: 'FinancialTransactions',
    description: 'High-volume banking and fintech ledger transactions',
    category: 'Fintech',
    version: 1,
    isPredefined: true,
    isActive: true,
    fields: [
      {
        name: 'transactionId',
        type: 'String',
        description: 'Unique financial reference code',
        constraints: {
          required: true,
          unique: true,
          pattern: 'alphanumeric',
          min: 6,
          max: 50
        }
      },
      {
        name: 'senderAccount',
        type: 'String',
        description: 'Source account or IBAN number',
        constraints: {
          required: true,
          min: 6,
          max: 34
        }
      },
      {
        name: 'receiverAccount',
        type: 'String',
        description: 'Destination account or IBAN number',
        constraints: {
          required: true,
          min: 6,
          max: 34
        }
      },
      {
        name: 'amount',
        type: 'Number',
        description: 'Transfer amount',
        constraints: {
          required: true,
          min: 0.01,
          max: 100000000
        }
      },
      {
        name: 'currency',
        type: 'String',
        description: 'ISO-4217 standard currency code',
        constraints: {
          required: true,
          allowedValues: ['USD', 'EUR', 'GBP', 'CAD', 'JPY', 'INR', 'AUD', 'CHF', 'SGD'],
          defaultValue: 'USD'
        }
      },
      {
        name: 'transactionType',
        type: 'String',
        description: 'Financial movement type',
        constraints: {
          required: true,
          allowedValues: ['debit', 'credit', 'transfer', 'refund', 'fee']
        }
      },
      {
        name: 'timestamp',
        type: 'Date',
        description: 'Transaction settlement timestamp',
        constraints: {
          required: false
        }
      }
    ]
  },
  {
    name: 'ShipmentTracking',
    description: 'Logistics freight and parcel tracking pipeline schema',
    category: 'Logistics',
    version: 1,
    isPredefined: true,
    isActive: true,
    fields: [
      {
        name: 'trackingNumber',
        type: 'String',
        description: 'Waybill tracking identifier',
        constraints: {
          required: true,
          unique: true,
          min: 6,
          max: 35
        }
      },
      {
        name: 'carrier',
        type: 'String',
        description: 'Designated freight carrier',
        constraints: {
          required: true,
          allowedValues: ['FedEx', 'UPS', 'DHL', 'USPS', 'BlueDart', 'AmazonLogistics']
        }
      },
      {
        name: 'recipientEmail',
        type: 'String',
        description: 'Consignee delivery notification email',
        constraints: {
          required: true,
          pattern: 'email'
        }
      },
      {
        name: 'weightKg',
        type: 'Number',
        description: 'Gross shipment weight in kilograms',
        constraints: {
          required: true,
          min: 0.01,
          max: 10000
        }
      },
      {
        name: 'deliveryStatus',
        type: 'String',
        description: 'Shipment milestone progress',
        constraints: {
          required: true,
          allowedValues: ['manifested', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned'],
          defaultValue: 'manifested'
        }
      },
      {
        name: 'estimatedDelivery',
        type: 'Date',
        description: 'Estimated delivery date',
        constraints: {
          required: false
        }
      }
    ]
  },
  {
    name: 'PatientVitals',
    description: 'Healthcare clinical vitals and biometrics telemetry',
    category: 'Healthcare',
    version: 1,
    isPredefined: true,
    isActive: true,
    fields: [
      {
        name: 'patientId',
        type: 'String',
        description: 'Medical record number (MRN)',
        constraints: {
          required: true,
          pattern: 'alphanumeric',
          min: 4,
          max: 30
        }
      },
      {
        name: 'heartRateBpm',
        type: 'Number',
        description: 'Heart rate beats per minute',
        constraints: {
          required: true,
          min: 30,
          max: 250
        }
      },
      {
        name: 'bloodPressureSystolic',
        type: 'Number',
        description: 'Systolic blood pressure (mmHg)',
        constraints: {
          required: true,
          min: 50,
          max: 260
        }
      },
      {
        name: 'bloodPressureDiastolic',
        type: 'Number',
        description: 'Diastolic blood pressure (mmHg)',
        constraints: {
          required: true,
          min: 30,
          max: 160
        }
      },
      {
        name: 'oxygenSaturation',
        type: 'Number',
        description: 'SpO2 blood oxygen percentage',
        constraints: {
          required: true,
          min: 50,
          max: 100
        }
      },
      {
        name: 'statusCategory',
        type: 'String',
        description: 'Triage clinical status',
        constraints: {
          required: true,
          allowedValues: ['normal', 'elevated', 'critical', 'investigate'],
          defaultValue: 'normal'
        }
      }
    ]
  }
];

module.exports = {
  PREDEFINED_SCHEMAS
};
