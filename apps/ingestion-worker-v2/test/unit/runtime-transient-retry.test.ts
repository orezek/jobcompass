import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeTransientProcessingRetryBackoffMs,
  shouldRetryTransientProcessingFailure,
} from '../../src/runtime.js';

test('computeTransientProcessingRetryBackoffMs uses exponential backoff capped at 4000ms', () => {
  assert.equal(computeTransientProcessingRetryBackoffMs(1), 500);
  assert.equal(computeTransientProcessingRetryBackoffMs(2), 1000);
  assert.equal(computeTransientProcessingRetryBackoffMs(3), 2000);
  assert.equal(computeTransientProcessingRetryBackoffMs(4), 4000);
  assert.equal(computeTransientProcessingRetryBackoffMs(10), 4000);
  assert.equal(computeTransientProcessingRetryBackoffMs(0), 500);
});

test('shouldRetryTransientProcessingFailure allows exactly three retries', () => {
  assert.equal(shouldRetryTransientProcessingFailure(1), true);
  assert.equal(shouldRetryTransientProcessingFailure(2), true);
  assert.equal(shouldRetryTransientProcessingFailure(3), true);
  assert.equal(shouldRetryTransientProcessingFailure(4), false);
});
