const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../index.cjs');

test('prettier config exposes shared defaults', () => {
  assert.equal(config.printWidth, 100);
  assert.equal(config.singleQuote, true);
  assert.ok(Array.isArray(config.overrides));
});
