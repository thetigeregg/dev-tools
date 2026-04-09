const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../index.cjs');

test('ncu config pins special-case upgrade policy', () => {
  assert.equal(config.target('@types/node'), 'minor');
  assert.equal(config.target('vite'), 'latest');
});
