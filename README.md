# `@thetigeregg/dev-tools`

Shared development tooling for thetigeregg projects.

This repository is a private monorepo for publishable internal packages. It centralizes reusable developer infrastructure so consumer repos can stay thin and project-specific.

## Packages

- `@thetigeregg/dev-cli`: the `devx` CLI for shared workflows such as task/worktree lifecycle, env reconciliation, and multi-package dependency maintenance
- `@thetigeregg/prettier-config`: shared Prettier defaults
- `@thetigeregg/commitlint-config`: shared commitlint defaults
- `@thetigeregg/lint-staged-config`: shared `lint-staged` defaults
- `@thetigeregg/ncu-config`: shared npm-check-updates policy

## Consumer Setup

### Recommended IDE: Cursor

Cursor is the recommended local IDE for repositories bootstrapped from this tooling.

- Keep local agent behavior in `.cursor/rules/`
- Use `@pr-prep` and `@pr-feedback` with the shared rules when preparing pull requests; `devx pr prep` / `devx pr feedback` write prompts under `prompts/` by default (configure or gitignore as needed)
- Keep `.github/copilot-instructions.md` for GitHub platform AI features (for example GitHub.com PR review flows)

Install the shared packages from your private registry:

```sh
npm install -D @thetigeregg/dev-cli @thetigeregg/prettier-config @thetigeregg/commitlint-config @thetigeregg/lint-staged-config @thetigeregg/ncu-config husky lint-staged @commitlint/cli prettier npm-check-updates
```

The local toolchain packages are required because the shared Husky hooks and `devx` dependency commands call their binaries directly.

Enable Husky after installing dependencies:

```sh
npm run prepare
```

Create a `devx.config.mjs` at the consumer repo root. The shared repo owns the generic mechanics; the consumer repo owns project topology and optional adapter hooks.

```js
export default {
  projectName: 'game-shelf',
  branchPrefix: 'feat/',
  baseBranch: 'main',
  worktreeRoot: 'worktrees',
  packageDirs: ['.', 'packages/web', 'packages/api'],
  env: {
    exampleFile: '.env.example',
    localFile: '.env.local',
    sharedTemplateFile: '~/.config/game-shelf/worktree.env',
  },
  worktree: {
    adapterModule: './tools/devx/worktree-adapter.mjs',
  },
};
```

## Module Format (ESM vs CommonJS)

- `@thetigeregg/dev-cli` is **ESM**. Consumer `devx.config.mjs` and any `worktree.adapterModule` are expected to be **ESM modules** (use `.mjs`, `export default`, and `import`).
- The shared config packages (`@thetigeregg/prettier-config`, `@thetigeregg/commitlint-config`, `@thetigeregg/lint-staged-config`, `@thetigeregg/ncu-config`) are **CommonJS**. Re-export them from consumer `*.cjs` config files using `module.exports = require('...')`.

## npm-check-updates v21 migration

`npm-check-updates` v21 requires Node `^20.19.0 || ^22.12.0 || >=24.0.0` and
npm `>=10`.

This monorepo and the published `@thetigeregg/*` packages declare a stricter
engine floor of Node `>=24.14.0`; use that range for local dev/CI when adopting
the shared packages.

No mandatory changes are required for repos already using this toolchain and the
shared `.ncurc.cjs` template (`module.exports = require('@thetigeregg/ncu-config')`).

Downstream repos should update if they still use older patterns:

- Rename CommonJS `.ncurc.js` files to `.ncurc.cjs` (or migrate to ESM config).
- In ESM scripts, replace `import ncu from 'npm-check-updates'` with either
  `import * as ncu from 'npm-check-updates'` or
  `import { run } from 'npm-check-updates'`.
- Ensure CI/local Node and npm versions satisfy the v21 minimums.

### Adapter Model

`devx.config.mjs` is the contract between the shared CLI and a consumer repo.

- Use config for stable repo facts such as branch naming, package directories, and env file locations.
- Use a local adapter module for project-specific orchestration that should not live in the shared core.
- `devx worktree ...` commands delegate to `runWorktreeDev(argv, options?)` from the adapter module.
- `devx task start ...` will call `bootstrapWorktree(context)` from the adapter when present. If no adapter is configured, the shared CLI skips project bootstrap cleanly.

Keep app-specific service names, Docker behavior, runtime config generation, and one-off repo assumptions in the consumer adapter, not in `@thetigeregg/dev-cli`.

## Consumer Files

Consumer repos should usually contain:

- `devx.config.mjs`
- `.prettierrc.cjs`
- `commitlint.config.cjs`
- `.ncurc.cjs`
- `package.json` scripts that call `devx`
- optional local adapter modules

Example config re-exports:

```js
// .prettierrc.cjs
module.exports = require('@thetigeregg/prettier-config');
```

```js
// commitlint.config.cjs
module.exports = {
  extends: ['@thetigeregg/commitlint-config'],
};
```

```js
// .ncurc.cjs
module.exports = require('@thetigeregg/ncu-config');
```

```js
// lint-staged.config.cjs
module.exports = require('@thetigeregg/lint-staged-config');
```

Example scripts:

```json
{
  "scripts": {
    "task:start": "devx task start",
    "worktree:cleanup": "devx worktree cleanup --auto",
    "env:reconcile": "devx env reconcile",
    "deps:audit": "devx deps audit-all",
    "deps:update": "devx deps ncu-all"
  }
}
```

## Setting Up A New Repo

Use this flow when you are adopting `dev-tools` in a brand-new repository.

The bootstrap flow below assumes a modern Node release. This repo uses Node `>=24.14.0`; use the root `.nvmrc` with `nvm use` (or install that version another way) so local installs and Husky hooks match the declared engine range.

1. Install the shared packages:

```sh
npm install -D @thetigeregg/dev-cli @thetigeregg/prettier-config @thetigeregg/commitlint-config @thetigeregg/lint-staged-config @thetigeregg/ncu-config husky lint-staged @commitlint/cli prettier npm-check-updates
```

2. Enable the shared Husky hooks:

```sh
npm run prepare
```

3. Run the bootstrap command from the repo root:

```sh
npx devx repo bootstrap
```

This seeds missing shared defaults without overwriting files that already exist. It is intended for first-time setup.
If `devx.config.mjs` does not exist yet, bootstrap falls back to the current working directory as the repo root. You can also point at another repo with `--repo-root <path>` or an explicit config file with `--config <path>`.

Bootstrap currently seeds:

- root config stubs and shared defaults such as `.prettierrc.cjs`, `.prettierignore`, `.ncurc.cjs`, `.editorconfig`, `.gitleaks.toml`, `commitlint.config.cjs`, `lint-staged.config.cjs`, and `devx.config.mjs`
- `.cursorignore` with baseline patterns for secrets and generated outputs
- `.cursor/rules/workflow.mdc` (stub — fill in your project's verify commands after bootstrap)
- shared Cursor rules (`.cursor/rules/commits.mdc`, `code.mdc`, `pr-prep.mdc`, `pr-feedback.mdc`)
- shared Cursor workspace defaults (`.cursor/settings.json`)
- shared Husky hooks such as `.husky/pre-commit` and `.husky/commit-msg`
- shared GitHub templates such as PR, issue, commit, Dependabot, and release templates
- `.github/copilot-instructions.md` (GitHub platform AI features only; local IDE rules live in `.cursor/rules/`)

4. Review the generated files and replace placeholder values in `devx.config.mjs` with real repo settings.

5. Keep project-specific logic local:

- `worktree.adapterModule`
- app-specific generation scripts
- app-specific database flows
- repo-specific CI workflows

6. Run a verification pass:

```sh
npm run lint
npm test
```

If the repo uses TypeScript, Angular, or another framework, also run the repo’s normal build command.

## Updating An Existing Repo

Use this flow when a repo already uses `dev-tools` and you want to pick up shared changes.

1. Update packages:

```sh
npm install
```

Or bump the relevant `@thetigeregg/*` packages explicitly if you pin versions.

2. Preview shared file updates:

```sh
npx devx repo sync --dry-run
```

3. Apply the shared updates:

```sh
npx devx repo sync
```

`repo sync` is for ongoing maintenance. It updates the shared surface (including `.cursor/rules/` shared rules and `.cursor/settings.json`) without touching repo-specific files such as:

- `.cursor/rules/workflow.mdc` (project-specific verify commands)
- `.cursorignore`
- `devx.config.mjs`
- `lint-staged.config.cjs`
- `.github/copilot-instructions.md`
- repo-specific Husky hooks like `.husky/post-checkout`

Some files are intentionally available only as optional starter templates in `packages/cli/templates/root-optional`, such as `.nvmrc`, `.dockerignore`, and `codecov.yml`. These are not applied automatically because they tend to vary more across repos.
If a repo has not created `devx.config.mjs` yet, you can still target it with `npx devx repo sync --repo-root <path>` or `npx devx repo sync --config <path>`.

4. Re-run the repo’s normal verification:

```sh
npm run lint
npm test
```

Also run the repo build if applicable.

## Cursor Migration Checklist

For existing repos moving from `AGENTS.md`/VS Code-first setup to Cursor-first setup:

1. Remove legacy `AGENTS.md` if present.
2. Run `npx devx repo bootstrap` (or `npx devx repo sync` if already bootstrapped).
3. Confirm `.cursor/rules/` contains `workflow.mdc`, `commits.mdc`, `code.mdc`, `pr-prep.mdc`, and `pr-feedback.mdc`.
4. Fill in project-specific verify commands in `.cursor/rules/workflow.mdc`.
5. Confirm `.cursorignore` is present and includes project-sensitive patterns.
6. Keep `.github/copilot-instructions.md` for GitHub platform-only AI usage.

## When To Use Bootstrap Vs Sync

- Use `repo bootstrap` when setting up a repo for the first time or when filling in missing shared files.
- Use `repo sync` when the repo already exists and you want to update the shared templates and shared hook/config surface.
- Use `repo sync --dry-run` before sync if you want to preview changes first.

## Local Development

```sh
npm install
npm test
npm run smoke
```

The smoke check verifies that workspace package exports resolve and that the `devx` entrypoint responds to `--help`.

This repo also dogfoods its own shared tooling at the root:

- [devx.config.mjs](./devx.config.mjs) configures `devx` against the workspace packages
- [.prettierrc.cjs](./.prettierrc.cjs) re-exports `@thetigeregg/prettier-config`
- [commitlint.config.cjs](./commitlint.config.cjs) extends `@thetigeregg/commitlint-config`
- [.ncurc.cjs](./.ncurc.cjs) re-exports `@thetigeregg/ncu-config`

Useful root scripts:

```sh
npm run deps:audit
npm run deps:ncu
npm run format
```

## Release Hygiene

PRs that change publishable package files under `packages/` are expected to include a changeset created with:

```sh
npm run changeset
```

The `Changeset Required` GitHub Action enforces this on pull requests.

If a PR touches package files but should not trigger a release, add the `no-release` label. The workflow also ignores package-only changes to:

- `README.md`
- `CHANGELOG.md`
- `test/`

## Releases

This repo uses Changesets for versioning and release management.

1. Make your changes.
2. Run `npm run changeset` and describe the package-level impact.
3. Merge the generated changeset with your work.
4. On `main`, the Changesets GitHub workflow opens or updates a release PR.
5. Merging that PR versions packages and publishes them through npm trusted publishing from GitHub Actions.

The repo root stays private; only workspace packages are published.

### Trusted Publishing Setup

Configure npm trusted publishing for each publishable package using:

- GitHub user or organization: `thetigeregg`
- Repository: `dev-tools`
- Workflow filename: `release.yml`

The release workflow is configured for OIDC-based publishing by default.
Token-based npm auth is enabled only when the repository variable `NPM_PUBLISH_AUTH` is set to `token`.
When that bootstrap mode is not enabled, the workflow stays on OIDC trusted publishing and ignores `NPM_TOKEN` even if the secret exists.
When bootstrap mode is enabled, configure the repository secret `NPM_TOKEN` so the publish step can use token-based auth.

For the GitHub side of Changesets:

- `CHANGESETS_GITHUB_TOKEN` is required.
- It should be a PAT or GitHub App token with permission to create and update pull requests in this repo.
- The built-in `GITHUB_TOKEN` is not sufficient for this repo because release PR updates need to trigger other `pull_request` workflows.

### New Package Bootstrap

Trusted publishing is configured per package on npm.

For a brand-new package that has never been published before:

1. Set the repository variable `NPM_PUBLISH_AUTH=token` and ensure `NPM_TOKEN` is configured.
2. Publish once using that token-based bootstrap path.
3. Open that package on npm and configure its trusted publisher to point at this repo and `release.yml`.
4. Remove the bootstrap mode by clearing `NPM_PUBLISH_AUTH`, then use trusted publishing for subsequent releases.

In practice, that means `NPM_TOKEN` is not needed for the packages already published from this repo, but a one-time token bootstrap may still be needed for future new package names.
