/**
 * StreamWeaver - Target Database Schemas & Helpers
 * Corresponds to Dev 2's Mongoose/MongoDB target collection schemas
 */

export const PREDEFINED_TARGET_SCHEMAS = [
  {
    id: 'ecommerce_orders',
    name: 'E-Commerce Transactions',
    badge: 'Retail',
    description: 'MongoDB target collection for processed retail orders, SKU line items, and fulfillment records.',
    targetCollection: 'ecommerce_orders',
    fields: [
      { name: 'orderId', label: 'Order ID', type: 'String', required: true, unique: true, description: 'Unique order identifier code', sampleFormat: 'ORD-10001' },
      { name: 'customerId', label: 'Customer ID', type: 'String', required: true, unique: false, description: 'Customer reference code', sampleFormat: 'CUST-2001' },
      { name: 'sku', label: 'SKU Code', type: 'String', required: true, unique: false, description: 'Stock keeping unit identifier', sampleFormat: 'SKU-501' },
      { name: 'productName', label: 'Product Name', type: 'String', required: true, unique: false, description: 'Full descriptive merchandise name', sampleFormat: 'Quantum Wireless Headset' },
      { name: 'category', label: 'Category', type: 'String', required: false, unique: false, description: 'Merchandise taxonomy category', sampleFormat: 'Electronics' },
      { name: 'unitPrice', label: 'Unit Price', type: 'Number', required: true, unique: false, description: 'Unit selling price in base currency', sampleFormat: '19.99' },
      { name: 'quantity', label: 'Quantity', type: 'Number', required: true, unique: false, description: 'Quantity of items ordered', sampleFormat: '2' },
      { name: 'timestamp', label: 'Order Timestamp', type: 'Date', required: true, unique: false, description: 'Order placement timestamp in ISO-8601', sampleFormat: '2026-09-17T12:00:00Z' },
      { name: 'status', label: 'Fulfillment Status', type: 'String', required: false, unique: false, description: 'Order status lifecycle tag', sampleFormat: 'COMPLETED' }
    ]
  },
  {
    id: 'financial_ledger',
    name: 'Financial Ledger Entries',
    badge: 'FinTech',
    description: 'Double-entry accounting journal target collection for debit/credit balance allocations.',
    targetCollection: 'ledger_entries',
    fields: [
      { name: 'txnId', label: 'Transaction ID', type: 'String', required: true, unique: true, description: 'Unique financial transaction ID', sampleFormat: 'TXN-90928-1' },
      { name: 'accountNumber', label: 'Account Number', type: 'String', required: true, unique: false, description: 'General ledger account identifier', sampleFormat: 'ACC-004001' },
      { name: 'accountType', label: 'Account Type', type: 'String', required: true, unique: false, description: 'Accounting classification (ASSET, LIABILITY, etc.)', sampleFormat: 'ASSET' },
      { name: 'debitAmount', label: 'Debit Amount', type: 'Number', required: false, unique: false, description: 'Debit sum booked to account', sampleFormat: '139.75' },
      { name: 'creditAmount', label: 'Credit Amount', type: 'Number', required: false, unique: false, description: 'Credit sum booked to account', sampleFormat: '0.00' },
      { name: 'currency', label: 'Currency', type: 'String', required: true, unique: false, description: 'ISO 4217 three-letter currency symbol', sampleFormat: 'USD' },
      { name: 'clearingCode', label: 'Clearing Code', type: 'String', required: false, unique: false, description: 'Interbank settlement clearing node', sampleFormat: 'CLR-NYC-01' },
      { name: 'valueDate', label: 'Value Date', type: 'Date', required: true, unique: false, description: 'Settlement or value accrual date', sampleFormat: '2026-09-15' }
    ]
  },
  {
    id: 'user_profiles',
    name: 'Customer & User Profiles',
    badge: 'CRM',
    description: 'MongoDB target collection for sanitized customer records and profile analytics.',
    targetCollection: 'users',
    fields: [
      { name: 'userId', label: 'User ID', type: 'String', required: true, unique: true, description: 'Unique user identifier', sampleFormat: 'USR-8821' },
      { name: 'email', label: 'Email Address', type: 'String', required: true, unique: true, description: 'Primary contact email', sampleFormat: 'jane.doe@example.com' },
      { name: 'firstName', label: 'First Name', type: 'String', required: true, unique: false, description: 'User given name', sampleFormat: 'Jane' },
      { name: 'lastName', label: 'Last Name', type: 'String', required: false, unique: false, description: 'User surname', sampleFormat: 'Doe' },
      { name: 'phoneNumber', label: 'Phone Number', type: 'String', required: false, unique: false, description: 'Standard E.164 phone string', sampleFormat: '+1-555-0199' },
      { name: 'age', label: 'Age', type: 'Number', required: false, unique: false, description: 'Age in completed years', sampleFormat: '29' },
      { name: 'isActive', label: 'Is Active', type: 'Boolean', required: false, unique: false, description: 'Account active flag', sampleFormat: 'true' },
      { name: 'registeredAt', label: 'Registration Date', type: 'Date', required: true, unique: false, description: 'User registration timestamp', sampleFormat: '2026-01-10T08:30:00Z' }
    ]
  },
  {
    id: 'custom_generic',
    name: 'Generic Flexible Event Stream',
    badge: 'Analytics',
    description: 'Flexible target schema for general-purpose event logs, telemetry, and metrics ingestion.',
    targetCollection: 'events_stream',
    fields: [
      { name: 'eventId', label: 'Event ID', type: 'String', required: true, unique: true, description: 'Unique event identifier', sampleFormat: 'EVT-9001' },
      { name: 'eventType', label: 'Event Type', type: 'String', required: true, unique: false, description: 'Category or operation code', sampleFormat: 'USER_CLICK' },
      { name: 'timestamp', label: 'Timestamp', type: 'Date', required: true, unique: false, description: 'Event emission timestamp', sampleFormat: '2026-09-26T12:00:00Z' },
      { name: 'value', label: 'Metric Value', type: 'Number', required: false, unique: false, description: 'Numerical observation or metric', sampleFormat: '42.5' },
      { name: 'payload', label: 'Payload / Notes', type: 'String', required: false, unique: false, description: 'Raw payload or details string', sampleFormat: '{"source":"web"}' }
    ]
  }
];

/**
 * Normalizes field strings for case/separator-insensitive matching
 * e.g., 'first_name', 'firstName', 'First Name', 'FIRSTNAME' -> 'firstname'
 */
export function normalizeKey(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[_\-\s\.]+/g, '')
    .trim();
}

/**
 * Smart auto-mapping heuristic between source headers and target fields
 */
export function calculateAutoMappings(sourceColumns = [], targetFields = []) {
  const mappings = {};
  const usedTargets = new Set();

  // Common synonym dictionary for even smarter matching
  const synonyms = {
    'id': ['orderid', 'txnid', 'userid', 'eventid', 'identifier'],
    'orderid': ['id', 'ordernumber', 'orderno', 'order_num'],
    'txnid': ['id', 'transid', 'transactionid', 'reference', 'ref'],
    'userid': ['id', 'custid', 'customerid', 'accountid'],
    'custid': ['customerid', 'userid'],
    'name': ['productname', 'itemname', 'firstname', 'fullname'],
    'itemname': ['productname', 'merchandisename', 'title'],
    'cost': ['unitprice', 'price', 'amount'],
    'price': ['unitprice', 'cost', 'amount'],
    'qty': ['quantity', 'count', 'units'],
    'date': ['timestamp', 'valuedate', 'registeredat', 'createdat', 'time'],
    'time': ['timestamp', 'valuedate', 'registeredat', 'date'],
    'mail': ['email', 'emailaddress'],
    'phone': ['phonenumber', 'telephone', 'mobile']
  };

  // Pass 1: Exact normalized match
  for (const src of sourceColumns) {
    const normSrc = normalizeKey(src);
    for (const target of targetFields) {
      if (usedTargets.has(target.name)) continue;
      const normTarget = normalizeKey(target.name);
      const normLabel = normalizeKey(target.label);

      if (normSrc === normTarget || normSrc === normLabel) {
        mappings[src] = target.name;
        usedTargets.add(target.name);
        break;
      }
    }
  }

  // Pass 2: Synonym & Substring match for remaining unmapped sources
  for (const src of sourceColumns) {
    if (mappings[src]) continue;
    const normSrc = normalizeKey(src);

    for (const target of targetFields) {
      if (usedTargets.has(target.name)) continue;
      const normTarget = normalizeKey(target.name);

      // Check synonyms
      const targetSyns = synonyms[normTarget] || [];
      const srcSyns = synonyms[normSrc] || [];

      const matchBySynonym = targetSyns.includes(normSrc) || srcSyns.includes(normTarget);
      const matchByContains = (normSrc.length > 3 && normTarget.includes(normSrc)) || 
                              (normTarget.length > 3 && normSrc.includes(normTarget));

      if (matchBySynonym || matchByContains) {
        mappings[src] = target.name;
        usedTargets.add(target.name);
        break;
      }
    }
  }

  return mappings;
}
