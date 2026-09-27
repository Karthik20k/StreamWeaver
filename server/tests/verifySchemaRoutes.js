process.env.NODE_ENV = 'test';
const http = require('node:http');
const assert = require('node:assert');
const app = require('../src/index');

function makeRequest(server, path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const options = {
      hostname: '127.0.0.1',
      port: address.port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runRouteTests() {
  console.log('[Test API] Testing Target Schema & DLQ CRUD API routes...');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`[Test API] Ephemeral server running on port ${port}`);

  try {
    // 1. GET /api/schemas/predefined
    const predefinedRes = await makeRequest(server, '/api/schemas/predefined');
    assert.strictEqual(predefinedRes.status, 200);
    assert.strictEqual(predefinedRes.body.success, true);
    assert(Array.isArray(predefinedRes.body.data));
    assert(predefinedRes.body.data.length >= 4);
    console.log(' GET /api/schemas/predefined passed');

    // 2. GET /api/schemas
    const listRes = await makeRequest(server, '/api/schemas');
    assert.strictEqual(listRes.status, 200);
    assert.strictEqual(listRes.body.success, true);
    console.log(' GET /api/schemas passed');

    // 3. GET /api/schemas/:id (lookup by name)
    const singleRes = await makeRequest(server, '/api/schemas/CustomerOrders');
    assert.strictEqual(singleRes.status, 200);
    assert.strictEqual(singleRes.body.data.name, 'CustomerOrders');
    console.log(' GET /api/schemas/:id (CustomerOrders) passed');

    // 4. POST /api/schemas (save target schema)
    const newSchema = {
      name: 'CustomTestSchema',
      description: 'Dev 3 test schema',
      category: 'Testing',
      fields: [
        {
          name: 'sku',
          type: 'String',
          constraints: { required: true, pattern: 'alphanumeric' }
        },
        {
          name: 'price',
          type: 'Number',
          constraints: { required: true, min: 1 }
        }
      ]
    };
    const createRes = await makeRequest(server, '/api/schemas', 'POST', newSchema);
    assert([200, 201].includes(createRes.status));
    assert.strictEqual(createRes.body.success, true);
    assert.strictEqual(createRes.body.data.name, 'CustomTestSchema');
    console.log(' POST /api/schemas passed');

    // 5. POST /api/schemas/validate (run validation engine via API)
    const validationPayload = {
      schemaId: 'CustomerOrders',
      rows: [
        {
          orderId: 'ORD-VALID-1',
          customerEmail: 'alice@example.com',
          customerPhone: '+1-555-4321',
          amount: 88.50,
          quantity: 2,
          status: 'pending'
        },
        {
          orderId: 'ORD-INVALID-2',
          customerEmail: 'not-an-email',
          amount: -5,
          quantity: 0,
          status: 'unknown_status'
        }
      ]
    };
    const valRes = await makeRequest(server, '/api/schemas/validate', 'POST', validationPayload);
    assert.strictEqual(valRes.status, 200);
    assert.strictEqual(valRes.body.totalRows, 2);
    assert.strictEqual(valRes.body.validCount, 1);
    assert.strictEqual(valRes.body.invalidCount, 1);
    assert.strictEqual(valRes.body.dlqPreview.length > 0, true);
    assert(valRes.body.dlqPreview[0].jobId);
    assert(valRes.body.dlqPreview[0].rejectedReason);
    console.log(' POST /api/schemas/validate passed (with generated DLQ records)');

    // 6. POST /api/schemas/dlq and GET /api/schemas/dlq
    const dlqPayload = {
      jobId: 'job_api_test',
      rowNumber: 101,
      rawData: { fieldA: 'bad' },
      rejectedReason: 'Testing DLQ endpoint error recording',
      failedField: 'fieldA'
    };
    const dlqPostRes = await makeRequest(server, '/api/schemas/dlq', 'POST', dlqPayload);
    assert.strictEqual(dlqPostRes.status, 201);
    assert.strictEqual(dlqPostRes.body.success, true);
    console.log(' POST /api/schemas/dlq passed');

    const dlqGetRes = await makeRequest(server, '/api/schemas/dlq');
    assert.strictEqual(dlqGetRes.status, 200);
    assert.strictEqual(dlqGetRes.body.success, true);
    console.log(' GET /api/schemas/dlq passed');

    // 7. Verify alias /api/target-schemas
    const aliasRes = await makeRequest(server, '/api/target-schemas/predefined');
    assert.strictEqual(aliasRes.status, 200);
    assert.strictEqual(aliasRes.body.success, true);
    console.log(' GET /api/target-schemas alias route passed');

    console.log('\n=============================================');
    console.log(' ALL API CRUD & VALIDATION ROUTES PASSED!');
    console.log('=============================================\n');
  } finally {
    server.close();
  }
}

runRouteTests().catch((err) => {
  console.error('[Test API] Route test failed:', err);
  process.exit(1);
});
