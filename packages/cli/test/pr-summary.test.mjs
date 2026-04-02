import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSummaryPrompt } from '../src/pr-summary.mjs';

test('buildSummaryPrompt includes changed files and diff context', () => {
  const prompt = buildSummaryPrompt('diff --git a/file b/file', 'src/file.ts');

  assert.match(prompt, /Changed files:/);
  assert.match(prompt, /src\/file\.ts/);
  assert.match(prompt, /Git diff:/);
  assert.match(prompt, /diff --git a\/file b\/file/);
});
