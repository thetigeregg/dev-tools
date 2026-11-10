import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  analyzeChecks,
  buildCurrentStatus,
  buildInlineReviewTasks,
  collectDiscussionReviewItems,
  extractSnippet,
  formatInlineReviewTasks,
  isCopilotReviewAuthor,
  normalizeStatusChecks,
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

test('analyzeChecks treats completed blocking conclusions as failures', () => {
  const analysis = analyzeChecks([
    {
      name: 'CI',
      status: 'COMPLETED',
      conclusion: 'CANCELLED',
    },
    {
      name: 'Coverage Report',
      status: 'COMPLETED',
      conclusion: 'FAILURE',
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
  assert.deepEqual(analysis.skipped, []);
});

test('analyzeChecks treats skipped and neutral check runs as non-blocking', () => {
  const analysis = analyzeChecks([
    { name: 'claude', status: 'COMPLETED', conclusion: 'SKIPPED', workflowName: 'Claude Code' },
    { name: 'CodeQL', status: 'COMPLETED', conclusion: 'NEUTRAL' },
    { name: 'Coverage Report', status: 'COMPLETED', conclusion: 'NEUTRAL' },
  ]);

  assert.deepEqual(analysis.ciFailures, []);
  assert.deepEqual(analysis.coverageFailures, []);
  assert.deepEqual(analysis.pending, []);
  assert.deepEqual(
    analysis.skipped.map((check) => [check.name, check.conclusion]),
    [
      ['claude', 'SKIPPED'],
      ['CodeQL', 'NEUTRAL'],
      ['Coverage Report', 'NEUTRAL'],
    ]
  );
});

test('analyzeChecks maps commit status contexts by state', () => {
  const analysis = analyzeChecks([
    {
      context: 'codecov/patch',
      state: 'SUCCESS',
      targetUrl: 'https://app.codecov.io/patch',
      status: null,
      conclusion: null,
    },
    { context: 'codecov/project', state: 'FAILURE' },
    { context: 'deploy/preview', state: 'ERROR' },
    { context: 'ci/legacy', state: 'PENDING' },
    { context: 'ci/required', state: 'EXPECTED' },
  ]);

  assert.deepEqual(
    analysis.successes.map((check) => [check.name, check.detailsUrl]),
    [['codecov/patch', 'https://app.codecov.io/patch']]
  );
  assert.deepEqual(
    analysis.coverageFailures.map((check) => check.name),
    ['codecov/project']
  );
  assert.deepEqual(
    analysis.ciFailures.map((check) => [check.name, check.conclusion]),
    [['deploy/preview', 'ERROR']]
  );
  assert.deepEqual(
    analysis.pending.map((check) => check.name),
    ['ci/legacy', 'ci/required']
  );
});

test('analyzeChecks keeps unknown-status checks pending', () => {
  const analysis = analyzeChecks([{ name: 'mystery' }]);

  assert.deepEqual(
    analysis.pending.map((check) => [check.name, check.status]),
    [['mystery', 'UNKNOWN']]
  );
});

test('analyzeChecks normalizes lowercase check-run status and conclusion', () => {
  const analysis = analyzeChecks([
    { name: 'build', status: 'completed', conclusion: 'success' },
    { name: 'docs', status: 'completed', conclusion: 'skipped' },
    { name: 'lint', status: 'completed', conclusion: 'failure' },
  ]);

  assert.deepEqual(
    analysis.successes.map((check) => check.name),
    ['build']
  );
  assert.deepEqual(
    analysis.skipped.map((check) => check.name),
    ['docs']
  );
  assert.deepEqual(
    analysis.ciFailures.map((check) => check.name),
    ['lint']
  );
});

const emptyStatusData = (checks) => ({
  checks: {
    ciFailures: [],
    coverageFailures: [],
    pending: [],
    successes: [],
    skipped: [],
    ...checks,
  },
  coverage: { tasks: [] },
  review: { inline: [], general: [] },
});

test('buildCurrentStatus notes skipped checks next to the CI status', () => {
  const status = buildCurrentStatus(
    emptyStatusData({ skipped: [{ name: 'claude' }, { name: 'CodeQL' }] })
  );
  assert.match(status, /^CI: PASS \(2 skipped or neutral checks\)$/m);

  const single = buildCurrentStatus(emptyStatusData({ skipped: [{ name: 'claude' }] }));
  assert.match(single, /^CI: PASS \(1 skipped or neutral check\)$/m);
});

test('buildCurrentStatus omits the skipped note when nothing was skipped', () => {
  assert.match(buildCurrentStatus(emptyStatusData({})), /^CI: PASS$/m);
  assert.match(
    buildCurrentStatus({
      ...emptyStatusData({}),
      checks: { ...emptyStatusData({}).checks, skipped: undefined },
    }),
    /^CI: PASS$/m
  );
});

test('buildInlineReviewTasks carries review thread ids', () => {
  const tasks = buildInlineReviewTasks([
    {
      id: 'PRRT_one',
      isResolved: false,
      isOutdated: false,
      path: 'src/a.ts',
      line: 7,
      comments: { nodes: [{ author: { login: 'claude' }, body: 'Fix this.', diffHunk: '@@' }] },
    },
    {
      id: 'PRRT_two',
      isResolved: false,
      isOutdated: false,
      path: 'src/a.ts',
      line: 7,
      comments: { nodes: [{ author: { login: 'claude' }, body: 'Fix this.', diffHunk: '@@' }] },
    },
    {
      id: 'PRRT_done',
      isResolved: true,
      path: 'src/a.ts',
      line: 9,
      comments: { nodes: [{ author: { login: 'claude' }, body: 'Done.', diffHunk: '@@' }] },
    },
  ]);

  assert.deepEqual(
    tasks.map((task) => task.threadId),
    ['PRRT_one', 'PRRT_two']
  );
});

test('formatInlineReviewTasks prints thread ids when present', () => {
  const grouped = new Map([
    [
      'src/a.ts',
      [
        { threadId: 'PRRT_one', author: 'claude', line: 7, body: 'Fix this.', diff: '' },
        { threadId: null, author: 'octocat', line: null, body: 'Nit.', diff: '@@ -1 +1 @@' },
      ],
    ],
  ]);

  const md = formatInlineReviewTasks(grouped);
  assert.match(md, /^1\. claude \(line 7\) \[thread: PRRT_one\]$/m);
  assert.match(md, /^2\. octocat$/m);
  assert.match(md, /```diff\n@@ -1 \+1 @@\n```/);
});

test('normalizeStatusChecks accepts a lone commit status context', () => {
  const check = { context: 'codecov/patch', state: 'FAILURE' };
  assert.deepEqual(normalizeStatusChecks(check), [check]);
  assert.deepEqual(normalizeStatusChecks({ unrelated: true }), []);
});
