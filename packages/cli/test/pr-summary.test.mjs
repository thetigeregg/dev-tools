import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

import { buildSummaryPrompt, runPrSummaryCli } from '../src/pr-summary.mjs';

function runGit(args, cwd) {
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

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

test('runPrSummaryCli writes prompts/pr-review-prompt.md and creates prompts/', async () => {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'dev-cli-pr-summary-'));
  const promptsDir = path.join(repoRoot, 'prompts');
  const outputPath = path.join(promptsDir, 'pr-review-prompt.md');

  writeFileSync(
    path.join(repoRoot, 'devx.config.mjs'),
    `export default { pr: { baseRef: 'main' } };\n`,
    'utf8'
  );

  runGit(['init'], repoRoot);
  runGit(['branch', '-M', 'main'], repoRoot);
  runGit(['config', 'user.email', 'test@example.com'], repoRoot);
  runGit(['config', 'user.name', 'test'], repoRoot);
  writeFileSync(path.join(repoRoot, 'file.txt'), 'v1\n', 'utf8');
  runGit(['add', 'file.txt'], repoRoot);
  runGit(['commit', '-m', 'initial'], repoRoot);
  runGit(['checkout', '-b', 'feat'], repoRoot);
  writeFileSync(path.join(repoRoot, 'file.txt'), 'v2\n', 'utf8');
  runGit(['add', 'file.txt'], repoRoot);
  runGit(['commit', '-m', 'change'], repoRoot);

  assert.equal(existsSync(promptsDir), false);

  const result = await runPrSummaryCli({ cwd: repoRoot });

  assert.equal(result.outputFile, outputPath);
  assert.equal(result.wroteFile, true);
  assert.ok(existsSync(promptsDir));
  assert.ok(existsSync(outputPath));
  const body = readFileSync(outputPath, 'utf8');
  assert.match(body, /Pre-PR Automated Code Review Prompt/);
  assert.match(body, /v2/);
});
