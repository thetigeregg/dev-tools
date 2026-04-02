import test from 'node:test';
import assert from 'node:assert/strict';

import { buildInstallArgs, runInstallAll } from '../src/deps-install.mjs';

test('buildInstallArgs uses root install for the repo root and prefix for nested packages', () => {
  assert.deepEqual(buildInstallArgs('.', 'install'), ['install']);
  assert.deepEqual(buildInstallArgs('.', 'ci'), ['ci']);
  assert.deepEqual(buildInstallArgs('/repo/server', 'install'), ['--prefix', '/repo/server', 'install']);
  assert.deepEqual(buildInstallArgs('/repo/server', 'ci'), ['--prefix', '/repo/server', 'ci']);
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
    { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['ci'], options: { cwd: '/repo', stdio: 'inherit' } },
    { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['--prefix', '/repo/server', 'ci'], options: { cwd: '/repo', stdio: 'inherit' } },
  ]);
});
