export const SAMPLE_DATASETS = [
  {
    id: 'ecommerce_orders',
    name: 'E-Commerce Transactions',
    badge: 'Retail',
    description: '5,000 order records with customer IDs, SKU codes, quantities, and price fields.',
    fileSizeStr: '624 KB',
    estimatedRows: 5000,
    generateContent: () => {
      const headers = ['order_id', 'customer_id', 'sku', 'product_name', 'category', 'unit_price', 'quantity', 'timestamp', 'status'];
      const categories = ['Electronics', 'Home & Kitchen', 'Apparel', 'Automotive', 'Books'];
      const statuses = ['COMPLETED', 'PENDING', 'SHIPPED', 'CANCELLED'];
      
      const rows = [headers.join(',')];
      for (let i = 1; i <= 250; i++) {
        const cat = categories[i % categories.length];
        const status = statuses[i % statuses.length];
        const price = (19.99 + (i * 3.75) % 300).toFixed(2);
        const qty = 1 + (i % 5);
        rows.push(`ORD-${10000 + i},CUST-${2000 + (i % 80)},SKU-${500 + i},"Smart Item ${i}",${cat},${price},${qty},2026-09-17T12:${(i % 60).toString().padStart(2, '0')}:00Z,${status}`);
      }
      return {
        fileName: 'ecommerce_orders_5000.csv',
        mimeType: 'text/csv',
        content: rows.join('\n')
      };
    }
  },
  {
    id: 'financial_ledger',
    name: 'Financial Ledger',
    badge: 'FinTech',
    description: 'High-frequency accounting journal entries with debit/credit balance allocations.',
    fileSizeStr: '1.2 MB',
    estimatedRows: 12500,
    generateContent: () => {
      const headers = ['txn_id', 'account_number', 'account_type', 'debit_amount', 'credit_amount', 'currency', 'clearing_code', 'value_date'];
      const acctTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
      
      const rows = [headers.join(',')];
      for (let i = 1; i <= 250; i++) {
        const acct = acctTypes[i % acctTypes.length];
        const debit = (i % 2 === 0) ? (50 + (i * 12.3)).toFixed(2) : '0.00';
        const credit = (i % 2 !== 0) ? (50 + (i * 12.3)).toFixed(2) : '0.00';
        rows.push(`TXN-90928-${i},ACC-00${4000 + (i % 50)},${acct},${debit},${credit},USD,CLR-NYC-01,2026-09-17`);
      }
      return {
        fileName: 'banking_ledger_entries.csv',
        mimeType: 'text/csv',
        content: rows.join('\n')
      };
    }
  },
  {
    id: 'iot_telemetry',
    name: 'IoT Sensor Stream',
    badge: 'Industrial',
    description: 'High-frequency time-series telemetry with vibration, temperature, and pressure metrics.',
    fileSizeStr: '4.8 MB',
    estimatedRows: 48000,
    generateContent: () => {
      const headers = ['device_uuid', 'firmware_ver', 'temp_celsius', 'vibration_hz', 'pressure_psi', 'battery_pct', 'sampled_at'];
      
      const rows = [headers.join(',')];
      for (let i = 1; i <= 250; i++) {
        const temp = (22.5 + (i * 0.12) % 40).toFixed(2);
        const vib = (120.4 + (i * 1.5) % 80).toFixed(1);
        const press = (101.3 + (i * 0.05) % 15).toFixed(2);
        const batt = Math.max(10, 100 - (i % 90));
        rows.push(`DEV-${1000 + (i % 20)},v2.4.1,${temp},${vib},${press},${batt}%,2026-09-17T23:15:${(i % 60).toString().padStart(2, '0')}.000Z`);
      }
      return {
        fileName: 'industrial_iot_sensors.csv',
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
