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
devx pr prep
devx pr feedback <PR_NUMBER> [--copilot-only] [--include-coverage] [--debug]
devx github sarif pull [--repo owner/name] [--out-dir <path>] [--ref <ref>] [--category <value>] [--limit <n>] [--force] [--dry-run] [--debug]
devx release version [--dry-run]
devx repo bootstrap [--dry-run]
devx repo sync [--dry-run]
devx repo sync-templates [--dry-run]
```

## PR prompts

`devx pr prep` and `devx pr feedback` write generated Markdown prompts under `prompts/` by default (`prompts/pr-prep-prompt.md` and `prompts/pr-feedback-prompt.md`). The CLI creates `prompts/` when needed. Override paths with `pr.prepOutputFile` and `pr.feedbackOutputFile` in `devx.config.mjs` (paths are resolved relative to the repository root). Ignore `prompts/` in `.gitignore` if you do not want those files tracked.

### Migration from `review`/`agent`

- `devx pr review` -> `devx pr prep`
- `devx pr agent` -> `devx pr feedback`
- `pr.reviewOutputFile` -> `pr.prepOutputFile`
- `pr.agentOutputFile` -> `pr.feedbackOutputFile`
- `prompts/pr-review-prompt.md` -> `prompts/pr-prep-prompt.md`
- `prompts/pr-agent-prompt.md` -> `prompts/pr-feedback-prompt.md`
- `DEBUG_PR_AGENT` -> `DEBUG_PR_FEEDBACK` (`DEBUG_PR_AGENT` remains supported as an alias)

## GitHub SARIF Pull

Download GitHub code scanning SARIF analyses for the current repository:

```sh
devx github sarif pull
```

Optional flags:

- `--repo owner/name` to target a different GitHub repository
- `--out-dir <path>` to override the local output directory
- `--ref <ref>` to pull analyses only for a specific full Git ref (for example, `refs/heads/main`)
- `--category <value>` to pull analyses only for a specific category
- `--limit <n>` to cap how many analyses are processed after filtering
- `--force` to re-download analyses even if the analysis ID is already present locally
- `--dry-run` to preview downloads without writing files
- `--debug` to echo GitHub CLI commands as they run

`devx.config.mjs` can optionally define:

```js
export default {
  github: {
    repo: 'owner/name',
    sarifOutputDir: 'artifacts/sarif',
    sarifPullLimit: 25,
  },
};
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

Module format: `@thetigeregg/dev-cli` is ESM, so `devx.config.mjs` and any `worktree.adapterModule` should be authored as ESM modules (use `.mjs`, `export default`, and `import`).

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
      // Optional. Omit to use `npm ci --workspaces --include-workspace-root`.
      // Set `installScript` to an npm script name that exists in your root package.json.
      // installScript: 'worktree:install',
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

## Shared Templates

Shared templates live under:

- `packages/cli/templates/root`
- `packages/cli/templates/root-shared`
- `packages/cli/templates/root-optional`
- `packages/cli/templates/github`

Bootstrap a new consumer repo with missing defaults and config stubs:

```sh
devx repo bootstrap
```

Sync the shared GitHub template surface into an existing consumer repo:

```sh
devx repo sync
```

`devx repo sync-templates` remains as a compatibility alias for `devx repo sync`.

Use `--dry-run` to preview the target files without copying.

Bootstrap includes:

- `.cursorignore` with baseline ignore patterns for AI indexing safety
- `.cursor/rules/workflow.mdc` (stub — fill in project verify commands)
- shared Cursor workspace defaults (`.cursor/settings.json`)
- `.prettierrc.cjs`
- `.prettierignore`
- `.ncurc.cjs`
- `.editorconfig`
- `.gitleaks.toml`
- `commitlint.config.cjs`
- `devx.config.mjs`
- `lint-staged.config.cjs`
- `.husky/pre-commit`
- `.husky/commit-msg`
- `.github/copilot-instructions.md` (GitHub platform AI features only)
- shared `.github` templates
- shared Cursor rules (`.cursor/rules/commits.mdc`, `code.mdc`, `pr-prep.mdc`, `pr-feedback.mdc`)

Sync updates the shared surface, including:

- shared Cursor rules (`.cursor/rules/commits.mdc`, `code.mdc`, `pr-prep.mdc`, `pr-feedback.mdc`)
- shared Cursor workspace defaults (`.cursor/settings.json`)
- shared Husky hooks such as `.husky/pre-commit` and `.husky/commit-msg`
- `.editorconfig`
- `.prettierignore`
- `.gitleaks.toml`
- PR and issue templates
- commit template
- Dependabot and release config

`lint-staged.config.cjs` is bootstrap-only so consumer repos can customize it without later syncs overwriting local changes.

Optional starter files such as `.nvmrc`, `.dockerignore`, and `codecov.yml` are kept under `packages/cli/templates/root-optional` for manual copy-in rather than automatic sync.
