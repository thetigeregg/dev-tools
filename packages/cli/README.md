# `@thetigeregg/dev-cli`

Shared CLI for thetigeregg repository setup and maintenance workflows.

## Commands

```sh
devx task start <name>
devx worktree cleanup [--auto] [--dry-run]
devx worktree <adapter-command> [...]
devx env reconcile
devx deps install-all
devx deps ci-all
devx deps audit-all [--fix]
devx deps ncu-all
devx pr summary
devx pr agent <PR_NUMBER> [--copilot-only] [--include-coverage] [--debug]
devx release version [--dry-run]
```

## Shared Worktree API

The package also exports reusable worktree helpers for adapter modules:

- `createWorktreeContext`
- `printWorktreeInfo`
- `runWorktreeBootstrap`
- `runFrontendDev`
- `runPwaCommand`
- `runComposeCommand`
- `ensureLocalEnvFromSharedTemplate`
- `ensureDependenciesInstalled`
- runtime primitives such as `buildWorktreeRuntime`, `expandUserPath`, and `ensureParentDirectories`

## Config Contract

The CLI searches upward for `devx.config.mjs` and uses it to resolve:

- repository root
- branch and worktree defaults
- package directories for multi-package commands
- env file locations
- release file locations
- optional worktree adapter hooks

`worktree.adapterModule` powers repo-specific worktree commands. When present:

- `runWorktreeDev(argv, options?)` powers `devx worktree ...`

## Worktree Config

`devx.config.mjs` can provide a structured `worktree` section for the shared engine:

```js
export default {
  projectName: 'my-app',
  packageDirs: ['.', 'server'],
  worktree: {
    adapterModule: 'scripts/worktree-dev.mjs',
    bootstrap: {
      installScript: 'ci:all',
    },
    runtime: {
      projectSlugPrefix: 'myapp',
      worktreeHintMaxLength: 24,
      maxPortOffset: 10000,
      ports: {
        FRONTEND_PORT: 8100,
        API_HOST_PORT: 3000,
      },
    },
    env: {
      localFile: '.env',
      sharedTemplateFile: '~/.config/my-app/worktree.env',
      defaultSharedSecretsDir: '~/.config/my-app/nas-secrets',
    },
    compose: {
      files: ['docker-compose.yml', 'docker-compose.dev.yml'],
      projectNameEnvVar: 'COMPOSE_PROJECT_NAME',
      services: ['postgres', 'api'],
      restartServices: ['api'],
      logServices: ['api'],
      startCommandHint: 'npm run dev:stack:up',
    },
    frontend: {
      prestartCommand: 'npm run prestart',
      serveCommand: 'npx ng serve',
      defaultHost: '127.0.0.1',
      externalHost: '0.0.0.0',
      proxyRoutes: {
        '/v1': 'API_HOST_PORT',
      },
      localEnvironmentFile: 'src/environments/environment.local.ts',
      buildRoot: 'www/browser',
    },
    pwa: {
      prebuildCommand: 'npm run prebuild',
      buildCommand: 'npx ng build --configuration production',
      httpsServerScript: 'scripts/pwa-https-server.mjs',
      rootCaServerScript: 'scripts/pwa-root-ca-server.mjs',
      certDir: '.tmp/pwa-certs',
      certFileEnvVar: 'WORKTREE_PWA_CERT_FILE',
      keyFileEnvVar: 'WORKTREE_PWA_KEY_FILE',
      manualsPublicBaseUrl: null,
      pwaManualsPublicBaseUrl: '/manuals',
    },
    db: {
      seedPathEnvVar: 'DEV_DB_SEED_PATH',
      defaultSeedPath: '~/.cache/my-app/dev-db-seed/latest.sql.gz',
    },
  },
};
```

### What belongs in config

Use config for:

- base ports and worktree runtime defaults
- compose files and shared service lists
- frontend build and serve commands
- PWA script paths and certificate settings
- env and seed-path defaults

### What stays in the adapter

Keep repo-specific orchestration in `worktree.adapterModule`, including:

- custom help text and command routing
- DB seed refresh/apply logic
- repo-specific SQL or data reconciliation
- special-case service flows not expressible as shared config
