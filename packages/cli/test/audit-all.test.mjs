import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAuditArgs, runAudits } from '../src/audit-all.mjs';

test('buildAuditArgs uses --prefix for non-root packages', () => {
  assert.deepEqual(buildAuditArgs('.', false, '/repo'), ['audit']);
  assert.deepEqual(buildAuditArgs('packages/api', true, '/repo'), [
    '--prefix',
    '/repo/packages/api',
    'audit',
    'fix',
  ]);
});

test('runAudits collects failures and returns a failing exit code', () => {
  const seen = [];
  const logs = [];
  const errors = [];
  const spawn = (_command, args) => {
    seen.push(args);
    return { status: args.includes('/repo/packages/b') ? 1 : 0 };
  };

  const result = runAudits({
    projects: [
      { name: 'a', path: 'packages/a' },
      { name: 'b', path: 'packages/b' },
    ],
    repoRoot: '/repo',
    spawn,
    log: (message) => logs.push(message),
    errorLog: (message) => errors.push(message),
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].name, 'b');
  assert.equal(seen.length, 2);
  assert.ok(logs.some((message) => message.includes('Auditing a')));
  assert.ok(errors.some((message) => message.includes('remaining failures')));
});
