'use strict';

const assert = require('assert');
const DataTransformerStream = require('../src/utils/DataTransformerStream');

const mappingRules = {
  name: 'fullName',
  age: 'userAge',
  city: 'location',
};

const transformer = new DataTransformerStream(mappingRules);

const inputRows = [
  {
    name: 'Amit',
    age: '22',
    city: 'Ranchi',
  },
  {
    name: 'Priya',
    age: '23',
    city: 'Patna',
  },
];

const outputRows = [];

transformer.on('data', (row) => {
  outputRows.push(row);
});

transformer.on('end', () => {
  assert.strictEqual(outputRows.length, 2);

  assert.deepStrictEqual(outputRows[0], {
    isValid: true,
    data: {
      fullName: 'Amit',
      userAge: '22',
      location: 'Ranchi',
    },
    errors: [],
  });

  assert.deepStrictEqual(outputRows[1], {
    isValid: true,
    data: {
      fullName: 'Priya',
      userAge: '23',
      location: 'Patna',
    },
    errors: [],
  });

  console.log('DataTransformerStream test passed');
});

transformer.on('error', (err) => {
  console.error('DataTransformerStream test failed:', err);
  process.exitCode = 1;
});

for (const row of inputRows) {
  transformer.write(row);
}

transformer.end();