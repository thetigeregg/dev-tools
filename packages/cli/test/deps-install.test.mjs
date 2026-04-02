import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildInstallArgs, buildWorkspaceCiArgs, runInstallAll } from '../src/deps-install.mjs';

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'devx-deps-install-test-'));
}

test('buildInstallArgs uses root install for the repo root and prefix for nested packages', () => {
  assert.deepEqual(buildInstallArgs('.', 'install'), ['install']);
  assert.deepEqual(buildInstallArgs('.', 'ci'), ['ci']);
  assert.deepEqual(buildInstallArgs('/repo/server', 'install'), [
    '--prefix',
    '/repo/server',
    'install',
  ]);
  assert.deepEqual(buildInstallArgs('/repo/server', 'ci'), ['--prefix', '/repo/server', 'ci']);
});

test('buildWorkspaceCiArgs installs the workspace root and all workspaces together', () => {
  assert.deepEqual(buildWorkspaceCiArgs(), ['ci', '--workspaces', '--include-workspace-root']);
});

test('runInstallAll aggregates failures across projects', () => {
  const calls = [];
  const result = runInstallAll({
    projects: [
      { name: 'root', path: '.', absolutePath: '/repo' },
      { name: 'server', path: 'server', absolutePath: '/repo/server' },
    ],
    repoRoot: '/repo',
    mode: 'ci',
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return { status: args.includes('/repo/server') ? 2 : 0 };
    },
    log() {},
    errorLog() {},
  });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.failures, [{ name: 'server', exitCode: 2 }]);
  assert.deepEqual(calls, [
    {
      command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      args: ['ci'],
      options: { cwd: '/repo', stdio: 'inherit' },
    },
    {
      command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      args: ['--prefix', '/repo/server', 'ci'],
      options: { cwd: '/repo', stdio: 'inherit' },
    },
  ]);
});

test('runInstallAll uses workspace ci when a root lockfile manages workspaces', () => {
  const repoRoot = makeTempRepo();
  fs.writeFileSync(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ workspaces: ['packages/*'] }, null, 2),
    'utf8'
  );
  fs.writeFileSync(path.join(repoRoot, 'package-lock.json'), '{}\n', 'utf8');

  const calls = [];
  const result = runInstallAll({
    projects: [
      { name: 'root', path: '.', absolutePath: repoRoot },
      {
        name: 'lint-staged-config',
        path: 'packages/lint-staged-config',
        absolutePath: path.join(repoRoot, 'packages/lint-staged-config'),
      },
    ],
    repoRoot,
    mode: 'ci',
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0 };
    },
    log() {},
    errorLog() {},
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(calls, [
    {
      command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      args: ['ci', '--workspaces', '--include-workspace-root'],
      options: { cwd: repoRoot, stdio: 'inherit' },
    },
  ]);
});

test('runInstallAll also detects npm workspace object config', () => {
  const repoRoot = makeTempRepo();
  fs.writeFileSync(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ workspaces: { packages: ['packages/*'] } }, null, 2),
    'utf8'
  );
  fs.writeFileSync(path.join(repoRoot, 'package-lock.json'), '{}\n', 'utf8');

  const calls = [];
  const result = runInstallAll({
    projects: [{ name: 'root', path: '.', absolutePath: repoRoot }],
    repoRoot,
    mode: 'ci',
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0 };
    },
    log() {},
    errorLog() {},
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(calls, [
    {
      command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      args: ['ci', '--workspaces', '--include-workspace-root'],
      options: { cwd: repoRoot, stdio: 'inherit' },
    },
  ]);
});
