export const SAMPLE_DATASETS = [
  {
    id: 'ecommerce_orders',
    name: 'E-Commerce Transactions',
    badge: 'Retail',
    description: '1,000 order records with customer IDs, SKU codes, product categories, quantities, and price fields.',
    fileSizeStr: '1.2 MB',
    estimatedRows: 50000,
    generateContent: () => {
      const headers = ['order_id', 'customer_id', 'sku', 'product_name', 'category', 'unit_price', 'quantity', 'timestamp', 'status'];
      const categories = ['Electronics', 'Home & Kitchen', 'Apparel', 'Automotive', 'Books', 'Health', 'Sports'];
      const statuses = ['COMPLETED', 'PENDING', 'SHIPPED', 'CANCELLED', 'REFUNDED'];
      const products = [
        'Quantum Wireless Headset', 'Ergonomic Desk Chair', 'Ceramic Pour-Over Dripper',
        'USB-C 100W GaN Fast Charger', 'Mechanical Keyboard RGB', 'Hydration Flask 32oz',
        'Anodized Aluminum Laptop Stand', 'Noise Cancelling Earbuds Pro', 'Smart LED Lightstrip 5M'
      ];
      
      const rows = [headers.join(',')];
      for (let i = 1; i <= 1000; i++) {
        const cat = categories[i % categories.length];
        const status = statuses[i % statuses.length];
        const prod = products[i % products.length];
        const price = (19.99 + (i * 3.75) % 450).toFixed(2);
        const qty = 1 + (i % 8);
        const min = (i % 60).toString().padStart(2, '0');
        const sec = ((i * 7) % 60).toString().padStart(2, '0');
        rows.push(`ORD-${10000 + i},CUST-${2000 + (i % 120)},SKU-${500 + (i % 30)},"${prod} #${i}",${cat},${price},${qty},2026-09-17T12:${min}:${sec}Z,${status}`);
      }
      return {
        fileName: 'ecommerce_orders_1000_sample.csv',
        mimeType: 'text/csv',
        content: rows.join('\n')
      };
    }
  },
  {
    id: 'financial_ledger',
    name: 'Financial Ledger',
    badge: 'FinTech',
    description: '1,000 double-entry accounting journal entries with debit/credit balance allocations and settlement codes.',
    fileSizeStr: '1.4 MB',
    estimatedRows: 125000,
    generateContent: () => {
      const headers = ['txn_id', 'account_number', 'account_type', 'debit_amount', 'credit_amount', 'currency', 'clearing_code', 'value_date'];
      const acctTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
      const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'];
      const clearingCodes = ['CLR-NYC-01', 'CLR-LON-04', 'CLR-TYO-02', 'CLR-FRA-09', 'CLR-SGP-03'];
      
      const rows = [headers.join(',')];
      for (let i = 1; i <= 1000; i++) {
        const acct = acctTypes[i % acctTypes.length];
        const curr = currencies[i % currencies.length];
        const clr = clearingCodes[i % clearingCodes.length];
        const debit = (i % 2 === 0) ? (125 + (i * 14.75)).toFixed(2) : '0.00';
        const credit = (i % 2 !== 0) ? (125 + (i * 14.75)).toFixed(2) : '0.00';
        const dateNum = (1 + (i % 28)).toString().padStart(2, '0');
        rows.push(`TXN-90928-${i},ACC-00${4000 + (i % 80)},${acct},${debit},${credit},${curr},${clr},2026-09-${dateNum}`);
      }
      return {
        fileName: 'banking_ledger_1000_sample.csv',
        mimeType: 'text/csv',
        content: rows.join('\n')
      };
    }
  },
  {
    id: 'iot_telemetry',
    name: 'IoT Sensor Stream',
    badge: 'Industrial',
    description: '1,000 high-frequency sensor readings with vibration, thermal metrics, and atmospheric pressures.',
    fileSizeStr: '1.1 MB',
    estimatedRows: 480000,
    generateContent: () => {
      const headers = ['device_uuid', 'firmware_ver', 'temp_celsius', 'vibration_hz', 'pressure_psi', 'battery_pct', 'sampled_at'];
      const firmwares = ['v2.4.1', 'v2.5.0-rc2', 'v3.0.1-edge', 'v2.4.9'];
      
      const rows = [headers.join(',')];
      for (let i = 1; i <= 1000; i++) {
        const fw = firmwares[i % firmwares.length];
        const temp = (22.5 + (i * 0.14) % 45).toFixed(2);
        const vib = (120.4 + (i * 1.8) % 95).toFixed(1);
        const press = (101.3 + (i * 0.08) % 20).toFixed(2);
        const batt = Math.max(12, 100 - (i % 88));
        const sec = (i % 60).toString().padStart(2, '0');
        rows.push(`DEV-${1000 + (i % 50)},${fw},${temp},${vib},${press},${batt}%,2026-09-17T23:15:${sec}.000Z`);
      }
      return {
        fileName: 'industrial_iot_1000_sample.csv',
        mimeType: 'text/csv',
        content: rows.join('\n')
      };
    }
  }
];

export function createSampleFile(datasetId) {
  const preset = SAMPLE_DATASETS.find(d => d.id === datasetId) || SAMPLE_DATASETS[0];
  const { fileName, mimeType, content } = preset.generateContent();
  const blob = new Blob([content], { type: mimeType });
  return new File([blob], fileName, { type: mimeType, lastModified: Date.now() });
}
