const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../index.cjs');

test('commitlint config extends the conventional preset', () => {
  assert.deepEqual(config.extends, ['@commitlint/config-conventional']);
});
