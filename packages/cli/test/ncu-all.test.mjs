import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInstallArgs,
  buildNcuArgs,
  formatCommand,
  getExitCode,
  isEntrypoint,
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
