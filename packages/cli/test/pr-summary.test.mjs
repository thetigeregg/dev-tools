import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSummaryPrompt } from '../src/pr-summary.mjs';

test('buildSummaryPrompt includes changed files and diff context', () => {
  const prompt = buildSummaryPrompt('diff --git a/file b/file', 'src/file.ts');
  const instructionsIndex = prompt.indexOf('Pre-PR Automated Code Review Prompt');
  const changedFilesIndex = prompt.indexOf('Changed files:');
  const gitDiffIndex = prompt.indexOf('Git diff:');

  assert.match(prompt, /Pre-PR Automated Code Review Prompt/);
  assert.match(prompt, /Run repository-standard quality checks/);
  assert.match(prompt, /Only report outcomes for checks you actually executed/);
  assert.match(prompt, /Final output format/);
  assert.match(prompt, /Changed files:/);
  assert.match(prompt, /src\/file\.ts/);
  assert.match(prompt, /Git diff:/);
  assert.match(prompt, /diff --git a\/file b\/file/);
  assert.notEqual(instructionsIndex, -1);
  assert.notEqual(changedFilesIndex, -1);
  assert.notEqual(gitDiffIndex, -1);
  assert.ok(instructionsIndex < changedFilesIndex);
  assert.ok(changedFilesIndex < gitDiffIndex);
});
