import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  analyzeChecks,
  collectDiscussionReviewItems,
  extractSnippet,
  isCopilotReviewAuthor,
  parseArgs,
  resolveFeedbackPromptOutputFile,
  writePromptOutputFile,
} from '../src/pr-agent.mjs';

test('collectDiscussionReviewItems keeps general PR discussion comments', () => {
  const items = collectDiscussionReviewItems(
    [
      {
        author: { login: 'octocat' },
        body: 'Please add rollout notes for this change.',
      },
    ],
    []
  );

  assert.deepEqual(items, [
    {
      author: 'octocat',
      body: 'Please add rollout notes for this change.',
      file: null,
      line: null,
      state: null,
    },
  ]);
});

test('isCopilotReviewAuthor only matches Copilot identities', () => {
  assert.equal(isCopilotReviewAuthor('copilot-pull-request-reviewer'), true);
  assert.equal(isCopilotReviewAuthor('dependabot[bot]'), false);
  assert.equal(isCopilotReviewAuthor('renovate-bot'), false);
});

test('extractSnippet resolves repo-relative files against the repo root', () => {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'dev-cli-pr-agent-'));
  const nestedCwd = path.join(repoRoot, 'packages', 'cli');
  mkdirSync(nestedCwd, { recursive: true });

  writeFileSync(
    path.join(repoRoot, 'src-file.js'),
    ['line 1', 'line 2', 'target 3', 'target 4', 'line 5', 'line 6'].join('\n')
  );

  const previousCwd = process.cwd();
  process.chdir(nestedCwd);

  try {
    const snippet = extractSnippet('src-file.js', [3, 4], { repoRoot });
    assert.match(snippet, /target 3/);
    assert.match(snippet, /target 4/);
  } finally {
    process.chdir(previousCwd);
  }
});

test('extractSnippet ignores paths that escape the repo root', () => {
  const parentDir = mkdtempSync(path.join(os.tmpdir(), 'dev-cli-pr-agent-parent-'));
  const repoRoot = path.join(parentDir, 'repo');
  mkdirSync(repoRoot, { recursive: true });

  writeFileSync(path.join(parentDir, 'outside.js'), 'secret\n');

  assert.equal(extractSnippet('../outside.js', [1], { repoRoot }), '');
  assert.equal(extractSnippet(path.join(parentDir, 'outside.js'), [1], { repoRoot }), '');
});

test('extractSnippet allows repo files whose names begin with dot-dot', () => {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'dev-cli-pr-agent-dotdot-'));
  const filePath = path.join(repoRoot, '..config.js');

  writeFileSync(filePath, ['line 1', 'line 2', 'target 3'].join('\n'));

  const snippet = extractSnippet('..config.js', [3], { repoRoot });

  assert.match(snippet, /target 3/);
});

test('parseArgs accepts already-sliced argv arrays', () => {
  assert.deepEqual(parseArgs(['123', '--debug', '--copilot-only', '--include-coverage']), {
    prNumber: '123',
    debug: true,
    copilotOnly: true,
    includeCoverage: true,
  });
});

test('parseArgs rejects non-numeric PR numbers with the usage error', () => {
  const originalExit = process.exit;
  const originalConsoleError = console.error;
  const consoleMessages = [];

  process.exit = (code) => {
    throw new Error(`process.exit:${code}`);
  };
  console.error = (message) => {
    consoleMessages.push(message);
  };

  try {
    assert.throws(() => parseArgs(['abc', '--debug']), /process\.exit:1/);
    assert.deepEqual(consoleMessages, [
      'Usage: devx pr feedback <PR_NUMBER> [--copilot-only] [--include-coverage] [--debug]',
    ]);
  } finally {
    process.exit = originalExit;
    console.error = originalConsoleError;
  }
});

test('resolveFeedbackPromptOutputFile defaults to prompts/pr-feedback-prompt.md under repo root', () => {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'dev-cli-pr-agent-output-'));
  const resolved = resolveFeedbackPromptOutputFile({
    repoRoot,
    pr: {},
  });

  assert.equal(resolved, path.join(repoRoot, 'prompts', 'pr-feedback-prompt.md'));
});

test('resolveFeedbackPromptOutputFile prefers feedbackOutputFileAbsolute when set', () => {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'dev-cli-pr-agent-output-abs-'));
  const custom = path.join(repoRoot, 'custom', 'out.md');
  const resolved = resolveFeedbackPromptOutputFile({
    repoRoot,
    pr: { feedbackOutputFileAbsolute: custom },
  });

  assert.equal(resolved, custom);
});

test('writePromptOutputFile creates parent directories and writes UTF-8 content', () => {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'dev-cli-pr-agent-write-'));
  const outputFile = path.join(repoRoot, 'prompts', 'nested', 'pr-feedback-prompt.md');

  assert.equal(existsSync(path.dirname(outputFile)), false);

  writePromptOutputFile(outputFile, 'hello\n');

  assert.ok(existsSync(path.dirname(outputFile)));
  assert.equal(readFileSync(outputFile, 'utf8'), 'hello\n');
});

test('analyzeChecks treats completed non-success conclusions as failures', () => {
  const analysis = analyzeChecks([
    {
      name: 'CI',
      status: 'COMPLETED',
      conclusion: 'CANCELLED',
    },
    {
      name: 'Coverage Report',
      status: 'COMPLETED',
      conclusion: 'NEUTRAL',
    },
    {
      name: 'Docs',
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
    },
    {
      name: 'Preview',
      status: 'IN_PROGRESS',
      conclusion: null,
    },
  ]);

  assert.deepEqual(
    analysis.ciFailures.map((check) => check.name),
    ['CI']
  );
  assert.deepEqual(
    analysis.coverageFailures.map((check) => check.name),
    ['Coverage Report']
  );
  assert.deepEqual(
    analysis.successes.map((check) => check.name),
    ['Docs']
  );
  assert.deepEqual(
    analysis.pending.map((check) => check.name),
    ['Preview']
  );
});
