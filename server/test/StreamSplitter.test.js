'use strict';

const assert = require('assert');

const StreamSplitter = require('../src/utils/StreamSplitter');
const BatchSink = require('../src/utils/BatchSink');

const validBatches = [];
const invalidBatches = [];

const destinationSink = new BatchSink({
  label: 'MongoBatch',
  batchSize: 2,
  flushIntervalMs: 1000,
  onFlush: async (batch) => {
    validBatches.push(batch);
  },
});

const dlqSink = new BatchSink({
  label: 'DLQBatch',
  batchSize: 2,
  flushIntervalMs: 1000,
  onFlush: async (batch) => {
    invalidBatches.push(batch);
  },
});

const splitter = new StreamSplitter({
  destinationSink,
  dlqSink,
});

splitter.on('finish', () => {
  try {
    assert.strictEqual(validBatches.length, 1);
    assert.strictEqual(invalidBatches.length, 1);

    assert.strictEqual(validBatches[0].length, 2);
    assert.strictEqual(invalidBatches[0].length, 2);

    assert.deepStrictEqual(validBatches[0][0], {
      id: 1,
      name: 'Amit',
    });

    assert.deepStrictEqual(validBatches[0][1], {
      id: 3,
      name: 'Priya',
    });

    assert.deepStrictEqual(invalidBatches[0][0], {
      data: {
        id: 2,
        name: 'Invalid',
      },
      errors: [
        {
          field: 'age',
          message: 'Invalid integer',
        },
      ],
    });

    assert.deepStrictEqual(invalidBatches[0][1], {
      data: {
        id: 4,
        name: 'Invalid 2',
      },
      errors: [
        {
          field: 'email',
          message: 'Invalid email',
        },
      ],
    });

    console.log('Day 3 StreamSplitter and BatchSink test passed');
  } catch (err) {
    console.error('Day 3 test failed:', err);
    process.exitCode = 1;
  }
});

splitter.on('error', (err) => {
  console.error('Day 3 StreamSplitter error:', err);
  process.exitCode = 1;
});

splitter.write({
  isValid: true,
  data: {
    id: 1,
    name: 'Amit',
  },
  errors: [],
});

splitter.write({
  isValid: false,
  data: {
    id: 2,
    name: 'Invalid',
  },
  errors: [
    {
      field: 'age',
      message: 'Invalid integer',
    },
  ],
});

splitter.write({
  isValid: true,
  data: {
    id: 3,
    name: 'Priya',
  },
  errors: [],
});

splitter.write({
  isValid: false,
  data: {
    id: 4,
    name: 'Invalid 2',
  },
  errors: [
    {
      field: 'email',
      message: 'Invalid email',
    },
  ],
});

splitter.end();