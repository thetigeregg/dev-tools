import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSummaryPrompt } from '../src/pr-summary.mjs';

test('buildSummaryPrompt includes changed files and diff context', () => {
  const prompt = buildSummaryPrompt('diff --git a/file b/file', 'src/file.ts');

  assert.match(prompt, /Changed files:/);
  assert.match(prompt, /src\/file\.ts/);
  assert.match(prompt, /Git diff:/);
  assert.match(prompt, /diff --git a\/file b\/file/);
  assert.match(prompt, /pre-PR review/i);
  assert.match(prompt, /regression risks/i);
  assert.match(prompt, /mention tests that are present in the diff/i);
  assert.match(prompt, /security, production-safety, or performance concerns/i);
});
