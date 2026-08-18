import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  hasExplicitEditorCommand,
  isPathWithinParent,
  normalizeEditorArgs,
  resolveEditorInvocation,
  runTaskStartCli,
} from '../src/task-start.mjs';

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

test('runTaskStartCli exits cleanly when baseBranch config is not a string', async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'dev-cli-task-start-'));
  const remotePath = path.join(tempRoot, 'remote.git');
  const seedPath = path.join(tempRoot, 'seed');
  const repoPath = path.join(tempRoot, 'repo');

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
      baseBranch: null,
      worktreeRoot: '.worktrees'
    };
`,
    'utf8'
  );
  runCommand('git', ['add', 'devx.config.mjs'], { cwd: repoPath });
  runCommand('git', ['commit', '-m', 'test: add invalid task-start config'], { cwd: repoPath });

  const originalError = console.error;
  const originalExit = process.exit;
  const originalCwd = process.cwd();
  const errors = [];
  console.error = (...args) => {
    errors.push(args.join(' '));
  };
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
    console.error = originalError;
    process.exit = originalExit;
  }

  assert.match(errors.join('\n'), /Invalid base branch config\. It must be a non-empty string\./);
});

test('runTaskStartCli rejects an invalid branch name produced by branchPrefix config', async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'dev-cli-task-start-'));
  const remotePath = path.join(tempRoot, 'remote.git');
  const seedPath = path.join(tempRoot, 'seed');
  const repoPath = path.join(tempRoot, 'repo');

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
      branchPrefix: '../',
      worktreeRoot: '.worktrees'
    };
`,
    'utf8'
  );
  runCommand('git', ['add', 'devx.config.mjs'], { cwd: repoPath });
  runCommand('git', ['commit', '-m', 'test: add invalid branch prefix config'], { cwd: repoPath });

  const originalError = console.error;
  const originalExit = process.exit;
  const originalCwd = process.cwd();
  const errors = [];
  console.error = (...args) => {
    errors.push(args.join(' '));
  };
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
    console.error = originalError;
    process.exit = originalExit;
  }

  assert.match(
    errors.join('\n'),
    /Invalid branch name\. Dot segments and empty path segments are not allowed\./
  );
});

function seedAndCloneRepo(tempRoot) {
  const remotePath = path.join(tempRoot, 'remote.git');
  const seedPath = path.join(tempRoot, 'seed');
  const repoPath = path.join(tempRoot, 'repo');

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

  return { remotePath, repoPath };
}

function commitAndPush(repoPath, message) {
  runCommand('git', ['add', '-A'], { cwd: repoPath });
  runCommand('git', ['commit', '-m', message], { cwd: repoPath });
  runCommand('git', ['push', 'origin', 'main'], { cwd: repoPath });
}

const MARKER_PACKAGE_JSON = JSON.stringify(
  {
    name: 'task-start-fixture',
    private: true,
    scripts: {
      'devx:test-marker':
        "node -e \"require('fs').writeFileSync('INSTALL_MARKER.txt', process.cwd())\"",
      'devx:test-fail': 'node -e "process.exit(7)"',
    },
  },
  null,
  2
);

test('runTaskStartCli installs dependencies inside the new worktree, not the original repo', async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'dev-cli-task-start-'));
  const { repoPath } = seedAndCloneRepo(tempRoot);

  writeFileSync(path.join(repoPath, 'package.json'), MARKER_PACKAGE_JSON, 'utf8');
  writeFileSync(
    path.join(repoPath, 'devx.config.mjs'),
    `export default {
      baseBranch: 'main',
      worktreeRoot: '.worktrees',
      editor: { command: 'true' },
      worktree: {
        bootstrap: { installScript: 'devx:test-marker' }
      }
    };
`,
    'utf8'
  );
  commitAndPush(repoPath, 'test: add install marker fixture');

  const worktreePath = path.join(repoPath, '.worktrees', 'feat/marker-task');
  const originalExit = process.exit;
  const originalCwd = process.cwd();
  process.exit = (code) => {
    throw new Error(`process.exit:${code}`);
  };

  try {
    process.chdir(tempRoot);
    await runTaskStartCli('marker-task', { cwd: repoPath });
  } finally {
    process.chdir(originalCwd);
    process.exit = originalExit;
  }

  assert.equal(existsSync(path.join(worktreePath, 'INSTALL_MARKER.txt')), true);
  assert.equal(
    readFileSync(path.join(worktreePath, 'INSTALL_MARKER.txt'), 'utf8'),
    realpathSync(worktreePath)
  );
  assert.equal(existsSync(path.join(repoPath, 'INSTALL_MARKER.txt')), false);
});

test('runTaskStartCli runs adapter bootstrap after dependencies are installed', async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'dev-cli-task-start-'));
  const { repoPath } = seedAndCloneRepo(tempRoot);

  writeFileSync(path.join(repoPath, 'package.json'), MARKER_PACKAGE_JSON, 'utf8');
  writeFileSync(
    path.join(repoPath, 'adapter.mjs'),
    `import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export async function bootstrapWorktree({ worktreePath }) {
  const markerPath = path.join(worktreePath, 'INSTALL_MARKER.txt');
  if (!existsSync(markerPath)) {
    throw new Error('INSTALL_MARKER.txt missing before adapter bootstrap ran');
  }
  writeFileSync(path.join(worktreePath, 'ADAPTER_MARKER.txt'), 'ok');
}
`,
    'utf8'
  );
  writeFileSync(
    path.join(repoPath, 'devx.config.mjs'),
    `export default {
      baseBranch: 'main',
      worktreeRoot: '.worktrees',
      editor: { command: 'true' },
      worktree: {
        adapterModule: './adapter.mjs',
        bootstrap: { installScript: 'devx:test-marker' }
      }
    };
`,
    'utf8'
  );
  commitAndPush(repoPath, 'test: add adapter ordering fixture');

  const worktreePath = path.join(repoPath, '.worktrees', 'feat/adapter-task');
  const originalExit = process.exit;
  const originalCwd = process.cwd();
  process.exit = (code) => {
    throw new Error(`process.exit:${code}`);
  };

  try {
    process.chdir(tempRoot);
    await runTaskStartCli('adapter-task', { cwd: repoPath });
  } finally {
    process.chdir(originalCwd);
    process.exit = originalExit;
  }

  assert.equal(existsSync(path.join(worktreePath, 'INSTALL_MARKER.txt')), true);
  assert.equal(existsSync(path.join(worktreePath, 'ADAPTER_MARKER.txt')), true);
});

test('runTaskStartCli surfaces a clear error and exit code when dependency install fails', async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'dev-cli-task-start-'));
  const { repoPath } = seedAndCloneRepo(tempRoot);

  writeFileSync(path.join(repoPath, 'package.json'), MARKER_PACKAGE_JSON, 'utf8');
  writeFileSync(
    path.join(repoPath, 'devx.config.mjs'),
    `export default {
      baseBranch: 'main',
      worktreeRoot: '.worktrees',
      editor: { command: 'true' },
      worktree: {
        bootstrap: { installScript: 'devx:test-fail' }
      }
    };
`,
    'utf8'
  );
  commitAndPush(repoPath, 'test: add failing install fixture');

  const originalError = console.error;
  const originalExit = process.exit;
  const originalCwd = process.cwd();
  const errors = [];
  console.error = (...args) => {
    errors.push(args.join(' '));
  };
  process.exit = (code) => {
    const error = new Error(`process.exit:${code}`);
    error.status = code;
    throw error;
  };

  try {
    process.chdir(tempRoot);
    await assert.rejects(runTaskStartCli('fail-task', { cwd: repoPath }), (error) => {
      assert.match(error.message, /process\.exit:7/);
      return true;
    });
  } finally {
    process.chdir(originalCwd);
    console.error = originalError;
    process.exit = originalExit;
  }

  assert.match(errors.join('\n'), /Dependency installation failed/);
});

test('normalizeEditorArgs returns an empty array for non-array values', () => {
  assert.deepEqual(normalizeEditorArgs(undefined), []);
  assert.deepEqual(normalizeEditorArgs('not-an-array'), []);
  assert.deepEqual(normalizeEditorArgs({}), []);
});

test('normalizeEditorArgs keeps only non-empty string entries', () => {
  assert.deepEqual(normalizeEditorArgs(['--profile', 123, '--flag']), ['--profile', '--flag']);
  assert.deepEqual(normalizeEditorArgs(['', '  ', '--reuse-window', '  --profile  ']), [
    '--reuse-window',
    '--profile',
  ]);
});

test('resolveEditorInvocation returns command and args from config', () => {
  assert.deepEqual(resolveEditorInvocation({ editor: { command: 'code' } }), {
    command: 'code',
    args: [],
  });
  assert.deepEqual(
    resolveEditorInvocation({ editor: { command: 'code', args: ['--profile', 'work'] } }),
    {
      command: 'code',
      args: ['--profile', 'work'],
    }
  );
});

test('hasExplicitEditorCommand is false when editor.command is missing or blank', () => {
  assert.equal(hasExplicitEditorCommand({}), false);
  assert.equal(hasExplicitEditorCommand({ editor: {} }), false);
  assert.equal(hasExplicitEditorCommand({ editor: { command: '' } }), false);
  assert.equal(hasExplicitEditorCommand({ editor: { command: '   ' } }), false);
  assert.equal(hasExplicitEditorCommand({ editor: { args: ['--profile'] } }), false);
});

test('hasExplicitEditorCommand is true for a non-empty editor.command', () => {
  assert.equal(hasExplicitEditorCommand({ editor: { command: 'code' } }), true);
  assert.equal(hasExplicitEditorCommand({ editor: { command: '  code  ' } }), true);
});

test('isPathWithinParent accepts paths when worktree root ends with a separator', () => {
  const worktreeRoot = path.join(os.tmpdir(), 'dev-cli-worktrees') + path.sep;
  const worktreePath = path.join(worktreeRoot, 'feat', 'example-task');

  assert.equal(isPathWithinParent(worktreeRoot, worktreePath), true);
});
