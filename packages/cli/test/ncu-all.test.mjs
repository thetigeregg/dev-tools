import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInstallArgs,
  buildNcuArgs,
  buildWorkspaceInstallArgs,
  buildWorkspaceNcuArgs,
  formatCommand,
  getExitCode,
  isEntrypoint,
  runWorkspaceNcuStep,
} from '../src/ncu-all.mjs';

test('buildNcuArgs keeps expected ncu-all flags', () => {
  assert.deepEqual(buildNcuArgs('/repo/packages/a/package.json'), [
    '-i',
    '--packageFile',
    '/repo/packages/a/package.json',
    '--format',
    'group,repo',
  ]);
});

test('buildInstallArgs installs dependencies in target package via npm --prefix', () => {
  assert.deepEqual(buildInstallArgs('/repo/packages/a'), [
    '--prefix',
    '/repo/packages/a',
    'install',
  ]);
});

test('formatCommand joins command and args consistently', () => {
  assert.equal(
    formatCommand('ncu', ['-i', '--format', 'group,repo']),
    'ncu -i --format group,repo'
  );
});

test('getExitCode prefers status, then code, then defaults to 1', () => {
  assert.equal(getExitCode({ status: 7, code: 2 }), 7);
  assert.equal(getExitCode({ code: 3 }), 3);
  assert.equal(getExitCode(new Error('boom')), 1);
});

test('isEntrypoint returns false when argv1 is falsy', () => {
  assert.equal(isEntrypoint({ argv1: null }), false);
});

test('buildWorkspaceNcuArgs checks and updates all workspaces in one pass', () => {
  assert.deepEqual(buildWorkspaceNcuArgs(), ['-i', '--workspaces', '--format', 'group,repo']);
});

test('buildWorkspaceInstallArgs installs from the workspace root without --prefix', () => {
  assert.deepEqual(buildWorkspaceInstallArgs(), ['install']);
});

test('runWorkspaceNcuStep runs a single ncu + install pass at the repo root', () => {
  const calls = [];
  const result = runWorkspaceNcuStep({
    repoRoot: '/repo',
    ncuCommand: '/repo/node_modules/.bin/ncu',
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
      command: '/repo/node_modules/.bin/ncu',
      args: ['-i', '--workspaces', '--format', 'group,repo'],
      options: { cwd: '/repo', stdio: 'inherit' },
    },
    {
      command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      args: ['install'],
      options: { cwd: '/repo', stdio: 'inherit' },
    },
  ]);
});

test('runWorkspaceNcuStep stops after ncu failure and skips the install step', () => {
  const calls = [];
  const result = runWorkspaceNcuStep({
    repoRoot: '/repo',
    ncuCommand: '/repo/node_modules/.bin/ncu',
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return { status: 2 };
    },
    log() {},
    errorLog() {},
  });

  assert.equal(result.exitCode, 2);
  assert.equal(calls.length, 1);
});
