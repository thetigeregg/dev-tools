import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildComposeArgs,
  buildNvmAwareInstallCommand,
  createWorktreeContext,
  ensureLocalEnvFromSharedTemplate,
  listMissingDependencyDirs,
  printWorktreeInfo,
  resolveShellInvocation,
  runFrontendDev,
  runPwaCommand,
  runPwaServe,
  runWorktreeBootstrap,
  WorktreeCommandError,
  WorktreePwaCertificateError,
  WorktreePwaServeError,
  servePwaRootCertificate,
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
    argv: ['bootstrap', '--force'],
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
  assert.deepEqual(context.args, ['bootstrap', '--force']);
  assert.equal(
    context.createPwaStackEnv({ NODE_ENV: 'development' }).MANUALS_PUBLIC_BASE_URL,
    '/manuals'
  );
  assert.equal(context.createSharedEnv({ processEnv: { PATH: '/usr/bin' } }).PATH, '/usr/bin');
});

test('createWorktreeContext preserves null manualsPublicBaseUrl overrides', async () => {
  const context = await createWorktreeContext({
    cwd: config.repoRoot,
    processEnv: {},
    config: {
      ...config,
      worktree: {
        ...config.worktree,
        pwa: {
          ...config.worktree.pwa,
          manualsPublicBaseUrl: null,
        },
      },
    },
  });

  assert.equal(context.manualsPublicBaseUrl, null);
  assert.equal(
    Object.hasOwn(context.createSharedEnv({ processEnv: {} }), 'MANUALS_PUBLIC_BASE_URL'),
    false
  );
});

test('createWorktreeContext resolves repo-relative shared env paths from top-level config', async () => {
  const context = await createWorktreeContext({
    cwd: config.repoRoot,
    processEnv: {},
    config: {
      ...config,
      env: {
        sharedTemplateFile: 'config/worktree.env',
      },
      worktree: {
        ...config.worktree,
        env: {},
      },
    },
  });

  assert.equal(context.sharedEnvFilePath, '/repo/worktrees/feat/example/config/worktree.env');
});

test('createWorktreeContext expands home-relative shared env paths from top-level config', async () => {
  const context = await createWorktreeContext({
    cwd: config.repoRoot,
    processEnv: {},
    config: {
      ...config,
      env: {
        sharedTemplateFile: '~/.config/game-shelf/worktree.env',
      },
      worktree: {
        ...config.worktree,
        env: {},
      },
    },
  });

  assert.equal(
    context.sharedEnvFilePath,
    path.join(os.homedir(), '.config', 'game-shelf', 'worktree.env')
  );
});

test('buildNvmAwareInstallCommand wraps dependency install commands with nvm activation', () => {
  assert.match(buildNvmAwareInstallCommand('npm run deps:ci-all'), /nvm use/);
  assert.match(buildNvmAwareInstallCommand('npm run deps:ci-all'), /npm run deps:ci-all/);
});

test('resolveShellInvocation falls back to cmd.exe on Windows', () => {
  assert.deepEqual(resolveShellInvocation('npm run dev', 'win32'), {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', 'npm run dev'],
  });
  assert.deepEqual(resolveShellInvocation('npm run dev', 'darwin'), {
    command: 'sh',
    args: ['-lc', 'npm run dev'],
  });
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

test('runFrontendDev defaults to an external bind host for simulator mode', async () => {
  const context = await createWorktreeContext({
    cwd: process.cwd(),
    processEnv: {},
    config: {
      ...config,
      repoRoot: process.cwd(),
    },
  });
  const commands = [];
  const previousLog = console.log;

  console.log = () => {};
  context.runShell = (command) => {
    commands.push(command);
  };

  try {
    runFrontendDev(context, { external: true });
  } finally {
    console.log = previousLog;
  }

  assert.equal(commands.length, 2);
  assert.match(commands[1], /'--host' '0\.0\.0\.0'/);
});

test('runFrontendDev uses Windows-safe quoting when the context platform is win32', async () => {
  const context = await createWorktreeContext({
    cwd: process.cwd(),
    processEnv: {},
    platform: 'win32',
    config: {
      ...config,
      repoRoot: process.cwd(),
    },
  });
  const commands = [];
  const previousLog = console.log;

  console.log = () => {};
  context.runShell = (command) => {
    commands.push(command);
  };

  try {
    runFrontendDev(context, { external: true });
  } finally {
    console.log = previousLog;
  }

  assert.equal(commands.length, 2);
  assert.match(commands[1], /"--host" "0\.0\.0\.0"/);
});

test('runPwaCommand exits with a clear error when no reachability port is configured', async () => {
  const context = await createWorktreeContext({
    cwd: config.repoRoot,
    processEnv: {},
    config: {
      ...config,
      worktree: {
        ...config.worktree,
        runtime: {
          ...config.worktree.runtime,
          ports: {
            ...config.worktree.runtime.ports,
          },
        },
        pwa: {
          ...config.worktree.pwa,
        },
      },
    },
  });
  delete context.runtime.ports.EDGE_HOST_PORT;
  delete context.config.worktree.pwa.requiredReachabilityPort;

  const errors = [];

  await runPwaCommand(context, 'serve', {
    isPortReachableFn: async () => {
      throw new Error('reachability should not run without a port');
    },
    logger: {
      log() {},
      error(message) {
        errors.push(message);
      },
    },
    exitFn(code) {
      throw new Error(`exit:${String(code)}`);
    },
  }).catch((error) => {
    assert.equal(error.message, 'exit:1');
  });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /requiredReachabilityPort or runtime\.ports\.EDGE_HOST_PORT/);
});

test('createWorktreeContext run helpers throw typed errors instead of exiting the host process', async () => {
  const repoRoot = process.cwd();
  const context = await createWorktreeContext({
    cwd: repoRoot,
    processEnv: { PATH: process.env.PATH ?? '' },
    config: {
      ...config,
      repoRoot,
    },
  });

  assert.throws(
    () => context.run('node', ['-e', 'process.exit(7)']),
    (error) =>
      error instanceof WorktreeCommandError &&
      error.command === 'node' &&
      error.status === 7 &&
      Array.isArray(error.args)
  );

  assert.throws(
    () => context.runCapture('node', ['-e', 'process.stdout.write("ok"); process.exit(9)']),
    (error) =>
      error instanceof WorktreeCommandError &&
      error.command === 'node' &&
      error.status === 9 &&
      error.stdout === 'ok'
  );
});

test('runWorktreeBootstrap passes force through to dependency installation', () => {
  const repoRoot = process.cwd();
  const localEnvPath = path.join(os.tmpdir(), `devx-bootstrap-${process.pid}.env`);
  const calls = [];
  const context = {
    localEnvPath,
    sharedEnvFilePath: path.join(repoRoot, 'package.json'),
    config: {
      packageDirPaths: [],
      worktree: {},
    },
    createSharedEnv() {
      return {};
    },
    runNvmAwareShell(command, fallbackCommand, env) {
      calls.push({ command, fallbackCommand, env });
    },
  };

  runWorktreeBootstrap(context, { force: true, printInfo: false });

  assert.equal(calls.length, 1);
  assert.match(calls[0].command, /npm ci --workspaces --include-workspace-root/);
  assert.equal(calls[0].fallbackCommand, 'npm ci --workspaces --include-workspace-root');
});

test('ensureLocalEnvFromSharedTemplate throws a clear error when force bootstrapping without a template path', () => {
  assert.throws(
    () =>
      ensureLocalEnvFromSharedTemplate(
        {
          localEnvPath: path.join(os.tmpdir(), `devx-bootstrap-missing-${process.pid}.env`),
          sharedEnvFilePath: undefined,
        },
        true
      ),
    /Shared env template path is not configured/
  );
});

test('ensureLocalEnvFromSharedTemplate throws a clear error when the template file is missing', () => {
  assert.throws(
    () =>
      ensureLocalEnvFromSharedTemplate(
        {
          localEnvPath: path.join(os.tmpdir(), `devx-bootstrap-missing-file-${process.pid}.env`),
          sharedEnvFilePath: path.join(os.tmpdir(), `devx-nope-${process.pid}.env`),
        },
        true
      ),
    /Shared env template not found at/
  );
});

test('listMissingDependencyDirs treats root workspace installs as satisfying nested packages', () => {
  const repoRoot = path.join(os.tmpdir(), `devx-workspace-deps-${process.pid}-${Date.now()}`);
  const packageDir = path.join(repoRoot, 'packages', 'app');

  mkdirSync(path.join(repoRoot, 'node_modules'), { recursive: true });
  mkdirSync(packageDir, { recursive: true });

  const rootPackageJson = {
    name: 'workspace-root',
    private: true,
    workspaces: ['packages/*'],
  };
  const nestedPackageJson = {
    name: 'app',
    version: '1.0.0',
    dependencies: {
      react: '^19.0.0',
    },
  };

  writeFileSync(path.join(repoRoot, 'package.json'), JSON.stringify(rootPackageJson, null, 2));
  writeFileSync(path.join(repoRoot, 'package-lock.json'), '{}\n');
  writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(nestedPackageJson, null, 2));

  const missing = listMissingDependencyDirs({
    config: {
      repoRoot,
      packageDirPaths: [
        { path: '.', absolutePath: repoRoot, name: 'root' },
        { path: 'packages/app', absolutePath: packageDir, name: 'app' },
      ],
    },
  });

  assert.deepEqual(missing, []);
});

test('printWorktreeInfo reports DB seed file status and path', () => {
  const logs = [];
  const previousLog = console.log;

  console.log = (message) => {
    logs.push(message);
  };

  try {
    printWorktreeInfo({
      cwd: '/repo/worktrees/feat/example',
      runtime: {
        projectName: 'gameshelf-feat-example',
        portOffset: 0,
        ports: {},
      },
      simulatorCertFile: '/tmp/localhost.pem',
      simulatorKeyFile: '/tmp/localhost-key.pem',
      secretsHostDir: '',
      localEnvPath: path.join(os.tmpdir(), `devx-missing-env-${process.pid}`),
      sharedEnvFilePath: undefined,
      createSharedEnv() {
        return {};
      },
      defaultSeedPath() {
        return path.join(os.tmpdir(), `devx-missing-seed-${process.pid}`);
      },
    });
  } finally {
    console.log = previousLog;
  }

  assert.ok(
    logs.some((message) =>
      message.includes(
        `DB seed file: [missing] (${path.join(os.tmpdir(), `devx-missing-seed-${process.pid}`)})`
      )
    )
  );
});

test('printWorktreeInfo reports the resolved secrets directory path', () => {
  const logs = [];
  const previousLog = console.log;

  console.log = (message) => {
    logs.push(message);
  };

  try {
    printWorktreeInfo({
      cwd: '/repo/worktrees/feat/example',
      runtime: {
        projectName: 'gameshelf-feat-example',
        portOffset: 0,
        ports: {},
      },
      simulatorCertFile: '/tmp/localhost.pem',
      simulatorKeyFile: '/tmp/localhost-key.pem',
      secretsHostDir: '~/shared/game-shelf/nas-secrets',
      localEnvPath: path.join(os.tmpdir(), `devx-missing-env-secrets-${process.pid}`),
      sharedEnvFilePath: undefined,
      createSharedEnv() {
        return {};
      },
      defaultSeedPath() {
        return path.join(os.tmpdir(), `devx-missing-seed-secrets-${process.pid}`);
      },
    });
  } finally {
    console.log = previousLog;
  }

  assert.ok(
    logs.some((message) =>
      message.includes(
        `Secrets dir: ${path.join(os.homedir(), 'shared', 'game-shelf', 'nas-secrets')} [configured]`
      )
    )
  );
});

test('servePwaRootCertificate throws a typed error when the mkcert root CA is unavailable', () => {
  assert.throws(
    () =>
      servePwaRootCertificate(
        {
          config: { worktree: { pwa: { rootCaServerScript: 'scripts/pwa-root-ca-server.mjs' } } },
          cwd: '/repo/worktrees/feat/example',
          runtime: { ports: { PWA_ROOT_CA_PORT: 8300 } },
          run() {
            throw new Error('context.run should not be called when the root CA is unavailable');
          },
        },
        {
          getSimulatorCertificateStatusFn() {
            return {
              mkcertAvailable: false,
              hasRootCa: false,
              rootCaPath: '',
            };
          },
        }
      ),
    (error) =>
      error instanceof WorktreePwaCertificateError &&
      error.message === 'mkcert root CA is not available. Run `npm run dev:pwa:certs:setup` first.'
  );
});

test('runPwaServe throws a typed certificate error instead of exiting', () => {
  let instructionsPrinted = 0;

  assert.throws(
    () =>
      runPwaServe(
        {
          buildRoot: '/repo/worktrees/feat/example/www/browser',
          config: { worktree: { pwa: { httpsServerScript: 'scripts/pwa-https-server.mjs' } } },
          cwd: '/repo/worktrees/feat/example',
          runtime: { ports: { EDGE_HOST_PORT: 8080, PWA_HOST_PORT: 8200 } },
          run() {
            throw new Error('context.run should not be called when certificates are missing');
          },
        },
        {
          getSimulatorCertificateStatusFn() {
            return {
              isConfigured: false,
              mkcertAvailable: true,
              hasRootCa: true,
              rootCaPath: '/tmp/rootCA.pem',
              certPath: '/tmp/localhost.pem',
              keyPath: '/tmp/localhost-key.pem',
            };
          },
          printMissingCertificateInstructionsFn() {
            instructionsPrinted += 1;
          },
        }
      ),
    (error) =>
      error instanceof WorktreePwaCertificateError &&
      error.message ===
        'PWA HTTPS certificates are not configured. Run `npm run dev:pwa:certs:setup` first.'
  );

  assert.equal(instructionsPrinted, 1);
});

test('runPwaServe throws a typed error when the production build output is missing', () => {
  assert.throws(
    () =>
      runPwaServe(
        {
          buildRoot: '/repo/worktrees/feat/example/www/browser',
          config: { worktree: { pwa: { httpsServerScript: 'scripts/pwa-https-server.mjs' } } },
          cwd: '/repo/worktrees/feat/example',
          runtime: { ports: { EDGE_HOST_PORT: 8080, PWA_HOST_PORT: 8200 } },
          run() {
            throw new Error('context.run should not be called when the build output is missing');
          },
        },
        {
          getSimulatorCertificateStatusFn() {
            return {
              isConfigured: true,
              mkcertAvailable: true,
              hasRootCa: true,
              rootCaPath: '/tmp/rootCA.pem',
              certPath: '/tmp/localhost.pem',
              keyPath: '/tmp/localhost-key.pem',
            };
          },
          printMissingCertificateInstructionsFn() {
            throw new Error(
              'printMissingCertificateInstructionsFn should not be called when certificates exist'
            );
          },
          existsSyncFn() {
            return false;
          },
        }
      ),
    (error) =>
      error instanceof WorktreePwaServeError &&
      error.message.includes(
        'Built frontend not found at /repo/worktrees/feat/example/www/browser/index.html.'
      )
  );
});
