import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildComposeArgs,
  buildNvmAwareInstallCommand,
  createWorktreeContext,
  runPwaCommand,
} from '../src/api.mjs';

const config = {
  repoRoot: '/repo/worktrees/feat/example',
  projectName: 'game-shelf',
  packageDirPaths: [
    { path: '.', absolutePath: '/repo/worktrees/feat/example', name: 'root' },
    { path: 'server', absolutePath: '/repo/worktrees/feat/example/server', name: 'server' },
  ],
  worktree: {
    runtime: {
      projectSlugPrefix: 'gameshelf',
      ports: {
        FRONTEND_PORT: 8100,
        EDGE_HOST_PORT: 8080,
        PWA_HOST_PORT: 8200,
        PWA_ROOT_CA_PORT: 8300,
      },
    },
    env: {
      localFile: '.env',
      sharedTemplateFile: '~/.config/game-shelf/worktree.env',
    },
    compose: {
      files: ['docker-compose.yml', 'docker-compose.dev.yml'],
      services: ['postgres', 'api'],
      restartServices: ['api'],
      logServices: ['api'],
      startCommandHint: 'npm run dev:stack:up',
    },
    frontend: {
      prestartCommand: 'npm run prestart',
      serveCommand: 'npx ng serve',
      proxyRoutes: {
        '/v1': 'EDGE_HOST_PORT',
      },
      buildRoot: 'www/browser',
    },
    pwa: {
      pwaManualsPublicBaseUrl: '/manuals',
      httpsServerScript: 'scripts/pwa-https-server.mjs',
      rootCaServerScript: 'scripts/pwa-root-ca-server.mjs',
    },
    db: {
      defaultSeedPath: '~/.cache/game-shelf/dev-db-seed/latest.sql.gz',
    },
  },
};

test('createWorktreeContext derives runtime, compose args, and env helpers from config', async () => {
  const context = await createWorktreeContext({
    cwd: config.repoRoot,
    processEnv: { PATH: '/usr/bin' },
    config,
  });

  assert.deepEqual(buildComposeArgs(config), [
    'compose',
    '-f',
    'docker-compose.yml',
    '-f',
    'docker-compose.dev.yml',
  ]);
  assert.ok(context.runtime.projectName.startsWith('gameshelf-feat-'));
  assert.equal(context.createPwaStackEnv({ NODE_ENV: 'development' }).MANUALS_PUBLIC_BASE_URL, '/manuals');
  assert.equal(context.createSharedEnv({ processEnv: { PATH: '/usr/bin' } }).PATH, '/usr/bin');
});

test('buildNvmAwareInstallCommand wraps npm scripts with nvm activation', () => {
  assert.match(buildNvmAwareInstallCommand('ci:all'), /nvm use/);
  assert.match(buildNvmAwareInstallCommand('ci:all'), /npm run ci:all/);
});

test('runPwaCommand simulator reconciles, builds, and serves in order', async () => {
  const context = await createWorktreeContext({
    cwd: config.repoRoot,
    processEnv: {},
    config,
  });
  const operations = [];

  await runPwaCommand(context, 'simulator', {
    isPortReachableFn: async () => true,
    reconcilePwaStackFn() {
      operations.push('reconcile');
    },
    buildPwaFn() {
      operations.push('build');
    },
    runPwaServeFn() {
      operations.push('serve');
    },
    logger: console,
    exitFn(code) {
      throw new Error(`unexpected exit ${String(code)}`);
    },
  });

  assert.deepEqual(operations, ['reconcile', 'build', 'serve']);
});
