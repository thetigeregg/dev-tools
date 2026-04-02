import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorktreeRuntime,
  computeOffset,
  detectWorktreeHint,
  sanitize,
} from '../src/worktree-runtime.mjs';

test('sanitize keeps URL-safe worktree names compact', () => {
  assert.equal(sanitize('Feature/Hello World'), 'feature-hello-world');
  assert.equal(sanitize('---'), '');
  assert.equal(sanitize('feature branch - extra', 15), 'feature-branch');
  assert.equal(sanitize(0), '0');
  assert.equal(sanitize(12345), '12345');
  assert.equal(sanitize(null), '');
});

test('detectWorktreeHint prefers the first directory below worktrees', () => {
  assert.equal(detectWorktreeHint('/repo/worktrees/feat/my-branch'), 'feat');
  assert.equal(detectWorktreeHint('/repo/apps/web'), 'web');
});

test('computeOffset respects explicit WORKTREE_PORT_OFFSET values', () => {
  assert.equal(computeOffset('/repo', { WORKTREE_PORT_OFFSET: '42' }), 42);
  assert.throws(() => computeOffset('/repo', { WORKTREE_PORT_OFFSET: '10000' }));
});

test('buildWorktreeRuntime derives stable project data from cwd', () => {
  const runtime = buildWorktreeRuntime({
    cwd: '/repo/worktrees/feat/my-branch',
    processEnv: {},
    projectSlugPrefix: 'game-shelf',
    basePorts: {
      web: 3000,
      api: 4000,
    },
  });

  assert.equal(runtime.worktreeHint, 'feat');
  assert.ok(runtime.projectName.startsWith('game-shelf-feat-'));
  assert.equal(runtime.ports.web - 3000, runtime.portOffset);
  assert.equal(runtime.ports.api - 4000, runtime.portOffset);
});
