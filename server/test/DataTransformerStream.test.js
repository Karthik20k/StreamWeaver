'use strict';

const assert = require('assert');
const DataTransformerStream = require('../src/utils/DataTransformerStream');

const mappingRules = {
  name: {
    targetKey: 'fullName',
    transformations: ['trim', 'uppercase'],
    type: 'string',
  },

  age: {
    targetKey: 'userAge',
    transformations: ['trim'],
    type: 'integer',
  },

  salary: {
    targetKey: 'salary',
    transformations: ['trim'],
    type: 'float',
  },

  active: {
    targetKey: 'isActive',
    transformations: ['trim', 'lowercase'],
    type: 'boolean',
  },

  joined: {
    targetKey: 'joinedAt',
    transformations: ['trim'],
    type: 'date',
  },

  city: {
    targetKey: 'city',
    transformations: ['trim', 'titlecase'],
    type: 'string',
    fallback: 'UNKNOWN',
  },
};

const transformer = new DataTransformerStream(mappingRules);

const inputRows = [
  {
    name: '  amit kumar  ',
    age: '22',
    salary: '45,000.50',
    active: 'yes',
    joined: '2026-01-15',
    city: ' ranchi ',
  },
];

const outputRows = [];

transformer.on('data', (row) => {
  outputRows.push(row);
});

transformer.on('end', () => {
  assert.strictEqual(outputRows.length, 1);

  const result = outputRows[0];

  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.data.fullName, 'AMIT KUMAR');
  assert.strictEqual(result.data.userAge, 22);
  assert.strictEqual(result.data.salary, 45000.5);
  assert.strictEqual(result.data.isActive, true);
  assert.strictEqual(result.data.city, 'Ranchi');

  assert.ok(
    typeof result.data.joinedAt === 'string' &&
    result.data.joinedAt.length > 0
  );

  assert.deepStrictEqual(result.errors, []);

  console.log('Day 2 transform helpers test passed');
});

transformer.on('error', (err) => {
  console.error('Day 2 test failed:', err);
  process.exitCode = 1;
});

for (const row of inputRows) {
  transformer.write(row);
}

transformer.end();