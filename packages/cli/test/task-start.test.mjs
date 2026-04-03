import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isPathWithinParent, runTaskStartCli } from '../src/task-start.mjs';

function runCommand(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  });
}

function configureGitRepo(repoPath) {
  runCommand('git', ['config', 'user.name', 'Dev Tools Test'], { cwd: repoPath });
  runCommand('git', ['config', 'user.email', 'dev-tools@example.com'], { cwd: repoPath });
}

test('runTaskStartCli does not execute shell content from baseBranch config', async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'dev-cli-task-start-'));
  const remotePath = path.join(tempRoot, 'remote.git');
  const seedPath = path.join(tempRoot, 'seed');
  const repoPath = path.join(tempRoot, 'repo');
  const markerPath = path.join(tempRoot, 'shell-injection-marker');
  const injectedBaseBranch = `main; touch '${markerPath}'`;

  runCommand('git', ['init', '--bare', remotePath]);
  runCommand('git', ['init', '-b', 'main', seedPath]);
  configureGitRepo(seedPath);
  runCommand('git', ['remote', 'add', 'origin', remotePath], { cwd: seedPath });
  writeFileSync(path.join(seedPath, 'README.md'), '# test\n');
  runCommand('git', ['add', 'README.md'], { cwd: seedPath });
  runCommand('git', ['commit', '-m', 'chore: seed repo'], { cwd: seedPath });
  runCommand('git', ['push', '-u', 'origin', 'main'], { cwd: seedPath });

  runCommand('git', ['clone', remotePath, repoPath]);
  configureGitRepo(repoPath);
  writeFileSync(
    path.join(repoPath, 'devx.config.mjs'),
    `export default {
      baseBranch: ${JSON.stringify(injectedBaseBranch)},
      worktreeRoot: '.worktrees'
    };
`,
    'utf8'
  );
  runCommand('git', ['add', 'devx.config.mjs'], { cwd: repoPath });
  runCommand('git', ['commit', '-m', 'test: add task-start config'], { cwd: repoPath });

  const originalExit = process.exit;
  const originalCwd = process.cwd();
  process.exit = (code) => {
    throw new Error(`process.exit:${code}`);
  };

  try {
    process.chdir(tempRoot);
    await assert.rejects(runTaskStartCli('safe-branch', { cwd: repoPath }), (error) => {
      assert.match(error.message, /process\.exit:1/);
      return true;
    });
  } finally {
    process.chdir(originalCwd);
    process.exit = originalExit;
  }

  assert.equal(existsSync(markerPath), false);
});

test('isPathWithinParent accepts paths when worktree root ends with a separator', () => {
  const worktreeRoot = path.join(os.tmpdir(), 'dev-cli-worktrees') + path.sep;
  const worktreePath = path.join(worktreeRoot, 'feat', 'example-task');

  assert.equal(isPathWithinParent(worktreeRoot, worktreePath), true);
});
