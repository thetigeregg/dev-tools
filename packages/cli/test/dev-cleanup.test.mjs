import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  trimTrailingPathSeparators,
  listLocalBranches,
  isSquashMerged,
  isBranchContentMerged,
  computeContentMergedBranches,
} from '../src/dev-cleanup.mjs';

test('trimTrailingPathSeparators preserves Windows drive roots', () => {
  assert.equal(trimTrailingPathSeparators('C:/', path.win32), 'C:/');
  assert.equal(trimTrailingPathSeparators('C:\\', path.win32), 'C:\\');
  assert.equal(
    trimTrailingPathSeparators('C:/worktrees/feature///', path.win32),
    'C:/worktrees/feature'
  );
  assert.equal(
    trimTrailingPathSeparators('C:\\worktrees\\feature\\\\\\', path.win32),
    'C:\\worktrees\\feature'
  );
});

function makeFakeGit(handlers) {
  const calls = [];
  const gitRunner = (args, options = {}) => {
    calls.push({ args, options });
    for (const handler of handlers) {
      const result = handler(args, options);
      if (result !== undefined) {
        if (result instanceof Error) throw result;
        return result;
      }
    }
    throw new Error(`Unexpected git call: ${args.join(' ')}`);
  };
  gitRunner.calls = calls;
  return gitRunner;
}

function matchArgs(args, expected) {
  return expected.every((value, index) => args[index] === value);
}

test('listLocalBranches trims and filters for-each-ref output', () => {
  const gitRunner = makeFakeGit([
    (args) =>
      matchArgs(args, ['for-each-ref', 'refs/heads', '--format=%(refname:short)'])
        ? '  feat/a  \n\nfeat/b\n  \nmain\n'
        : undefined,
  ]);

  assert.deepEqual(listLocalBranches(gitRunner), ['feat/a', 'feat/b', 'main']);
});

test('isBranchContentMerged detects a rebase-merged branch without running the squash check', () => {
  const gitRunner = makeFakeGit([
    (args) =>
      matchArgs(args, ['cherry', 'origin/main', 'feat/rebased']) ? '-abc123\n-def456\n' : undefined,
  ]);

  assert.equal(
    isBranchContentMerged({ branch: 'feat/rebased', baseRef: 'origin/main', gitRunner }),
    true
  );
  assert.ok(!gitRunner.calls.some((call) => call.args[0] === 'merge-base'));
  assert.ok(!gitRunner.calls.some((call) => call.args[0] === 'commit-tree'));
});

test('isBranchContentMerged treats zero unique commits as merged without a squash check', () => {
  const gitRunner = makeFakeGit([
    (args) => (matchArgs(args, ['cherry', 'origin/main', 'feat/noop']) ? '' : undefined),
  ]);

  assert.equal(
    isBranchContentMerged({ branch: 'feat/noop', baseRef: 'origin/main', gitRunner }),
    true
  );
  assert.equal(gitRunner.calls.length, 1);
});

test('isBranchContentMerged detects a squash-merged branch via the synthetic commit', () => {
  const gitRunner = makeFakeGit([
    (args) =>
      matchArgs(args, ['cherry', 'origin/main', 'feat/squashed'])
        ? '+aaa111\n+bbb222\n'
        : undefined,
    (args) =>
      matchArgs(args, ['merge-base', 'origin/main', 'feat/squashed']) ? 'base111\n' : undefined,
    (args) => (matchArgs(args, ['rev-parse', 'feat/squashed^{tree}']) ? 'treeAAA\n' : undefined),
    (args, options) => {
      if (!matchArgs(args, ['commit-tree', 'treeAAA', '-p', 'base111'])) return undefined;
      assert.equal(options.env.GIT_AUTHOR_NAME, 'devx-cleanup');
      assert.equal(options.env.GIT_AUTHOR_EMAIL, 'devx-cleanup@localhost');
      assert.equal(options.env.GIT_COMMITTER_NAME, 'devx-cleanup');
      assert.equal(options.env.GIT_COMMITTER_EMAIL, 'devx-cleanup@localhost');
      return 'synthCCC\n';
    },
    (args) => (matchArgs(args, ['cherry', 'origin/main', 'synthCCC']) ? '-synthCCC\n' : undefined),
  ]);

  assert.equal(
    isBranchContentMerged({ branch: 'feat/squashed', baseRef: 'origin/main', gitRunner }),
    true
  );
});

test('isBranchContentMerged returns false for a truly unmerged branch', () => {
  const gitRunner = makeFakeGit([
    (args) =>
      matchArgs(args, ['cherry', 'origin/main', 'feat/unmerged']) ? '+aaa111\n' : undefined,
    (args) =>
      matchArgs(args, ['merge-base', 'origin/main', 'feat/unmerged']) ? 'base111\n' : undefined,
    (args) => (matchArgs(args, ['rev-parse', 'feat/unmerged^{tree}']) ? 'treeBBB\n' : undefined),
    (args) =>
      matchArgs(args, ['commit-tree', 'treeBBB', '-p', 'base111']) ? 'synthDDD\n' : undefined,
    (args) => (matchArgs(args, ['cherry', 'origin/main', 'synthDDD']) ? '+synthDDD\n' : undefined),
  ]);

  assert.equal(
    isBranchContentMerged({ branch: 'feat/unmerged', baseRef: 'origin/main', gitRunner }),
    false
  );
});

test('isSquashMerged fails open (returns false) when merge-base cannot be found', () => {
  const gitRunner = makeFakeGit([
    (args) =>
      matchArgs(args, ['merge-base', 'origin/main', 'feat/unrelated'])
        ? new Error('fatal: no merge base')
        : undefined,
  ]);

  assert.equal(
    isSquashMerged({ branch: 'feat/unrelated', baseRef: 'origin/main', gitRunner }),
    false
  );
});

test('isSquashMerged fails open when commit-tree fails', () => {
  const gitRunner = makeFakeGit([
    (args) => (matchArgs(args, ['merge-base', 'origin/main', 'feat/x']) ? 'base111\n' : undefined),
    (args) => (matchArgs(args, ['rev-parse', 'feat/x^{tree}']) ? 'treeAAA\n' : undefined),
    (args) =>
      matchArgs(args, ['commit-tree', 'treeAAA', '-p', 'base111'])
        ? new Error('fatal: identity unknown')
        : undefined,
  ]);

  assert.equal(isSquashMerged({ branch: 'feat/x', baseRef: 'origin/main', gitRunner }), false);
});

test('computeContentMergedBranches filters candidates down to the merged ones', () => {
  const gitRunner = makeFakeGit([
    (args) =>
      matchArgs(args, ['cherry', 'origin/main', 'feat/rebased']) ? '-abc123\n' : undefined,
    (args) =>
      matchArgs(args, ['cherry', 'origin/main', 'feat/squashed']) ? '+aaa111\n' : undefined,
    (args) =>
      matchArgs(args, ['merge-base', 'origin/main', 'feat/squashed']) ? 'base111\n' : undefined,
    (args) => (matchArgs(args, ['rev-parse', 'feat/squashed^{tree}']) ? 'treeAAA\n' : undefined),
    (args) =>
      matchArgs(args, ['commit-tree', 'treeAAA', '-p', 'base111']) ? 'synthCCC\n' : undefined,
    (args) => (matchArgs(args, ['cherry', 'origin/main', 'synthCCC']) ? '-synthCCC\n' : undefined),
    (args) =>
      matchArgs(args, ['cherry', 'origin/main', 'feat/unmerged']) ? '+xyz789\n' : undefined,
    (args) =>
      matchArgs(args, ['merge-base', 'origin/main', 'feat/unmerged']) ? 'base222\n' : undefined,
    (args) => (matchArgs(args, ['rev-parse', 'feat/unmerged^{tree}']) ? 'treeBBB\n' : undefined),
    (args) =>
      matchArgs(args, ['commit-tree', 'treeBBB', '-p', 'base222']) ? 'synthDDD\n' : undefined,
    (args) => (matchArgs(args, ['cherry', 'origin/main', 'synthDDD']) ? '+synthDDD\n' : undefined),
  ]);

  const result = computeContentMergedBranches({
    candidates: ['feat/rebased', 'feat/squashed', 'feat/unmerged'],
    baseRef: 'origin/main',
    gitRunner,
  });

  assert.deepEqual(result, ['feat/rebased', 'feat/squashed']);
});
