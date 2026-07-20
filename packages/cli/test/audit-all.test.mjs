import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildAuditArgs, buildWorkspaceAuditArgs, runAudits } from '../src/audit-all.mjs';

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'devx-audit-all-test-'));
}

function writeWorkspaceRepo(repoRoot) {
  fs.writeFileSync(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ workspaces: ['packages/*'] }, null, 2),
    'utf8'
  );
  fs.writeFileSync(path.join(repoRoot, 'package-lock.json'), '{}\n', 'utf8');
}

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

test('buildWorkspaceAuditArgs runs a single root-level audit across workspaces', () => {
  assert.deepEqual(buildWorkspaceAuditArgs(false), [
    'audit',
    '--workspaces',
    '--include-workspace-root',
  ]);
  assert.deepEqual(buildWorkspaceAuditArgs(true), [
    'audit',
    'fix',
    '--workspaces',
    '--include-workspace-root',
  ]);
});

test('runAudits uses a single workspace audit pass when the repo declares workspaces', () => {
  const repoRoot = makeTempRepo();
  writeWorkspaceRepo(repoRoot);

  const calls = [];
  const result = runAudits({
    projects: [
      { name: 'root', path: '.' },
      { name: 'a', path: 'packages/a' },
    ],
    repoRoot,
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
      args: ['audit', '--workspaces', '--include-workspace-root'],
      options: { cwd: repoRoot, stdio: 'inherit' },
    },
  ]);
});

test('runAudits passes --fix through to the workspace audit pass', () => {
  const repoRoot = makeTempRepo();
  writeWorkspaceRepo(repoRoot);

  const calls = [];
  const result = runAudits({
    projects: [{ name: 'root', path: '.' }],
    repoRoot,
    shouldFix: true,
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
      args: ['audit', 'fix', '--workspaces', '--include-workspace-root'],
      options: { cwd: repoRoot, stdio: 'inherit' },
    },
  ]);
});
