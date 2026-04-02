import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  collectDiscussionReviewItems,
  extractSnippet,
  isCopilotReviewAuthor,
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
