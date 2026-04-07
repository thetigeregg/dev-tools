import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReviewPrompt } from '../src/pr-summary.mjs';

test('buildReviewPrompt includes changed files and diff context', () => {
  const prompt = buildReviewPrompt('diff --git a/file b/file', 'src/file.ts');

  assert.match(prompt, /Changed files:/);
  assert.match(prompt, /src\/file\.ts/);
  assert.match(prompt, /Git diff:/);
  assert.match(prompt, /diff --git a\/file b\/file/);
});
