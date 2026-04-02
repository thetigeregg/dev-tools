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

Install the shared packages from your private registry:

```sh
npm install -D @thetigeregg/dev-cli @thetigeregg/prettier-config @thetigeregg/commitlint-config @thetigeregg/lint-staged-config @thetigeregg/ncu-config husky lint-staged
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

The bootstrap flow below assumes a modern Node release. If you install the latest `lint-staged`, use Node `>=20.17` so local installs and Husky hooks match `lint-staged`'s supported engine range.

1. Install the shared packages:

```sh
npm install -D @thetigeregg/dev-cli @thetigeregg/prettier-config @thetigeregg/commitlint-config @thetigeregg/lint-staged-config @thetigeregg/ncu-config husky lint-staged
```

2. Add a minimal `devx.config.mjs` for the repo topology you want `devx` to understand.

3. Run the bootstrap command from the repo root:

```sh
npx devx repo bootstrap
```

This seeds missing shared defaults without overwriting files that already exist. It is intended for first-time setup.

Bootstrap currently seeds:

- root config stubs and shared defaults such as `.prettierrc.cjs`, `.prettierignore`, `.ncurc.cjs`, `.editorconfig`, `.gitleaks.toml`, `commitlint.config.cjs`, `lint-staged.config.cjs`, and `devx.config.mjs`
- `AGENTS.md`
- shared Husky hooks such as `.husky/pre-commit` and `.husky/commit-msg`
- shared GitHub templates such as PR, issue, commit, Dependabot, and release templates
- `.github/copilot-instructions.md`

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

`repo sync` is for ongoing maintenance. It updates the shared surface without touching repo-specific files such as:

- `AGENTS.md`
- `devx.config.mjs`
- `lint-staged.config.cjs`
- `.github/copilot-instructions.md`
- repo-specific Husky hooks like `.husky/post-checkout`

Some files are intentionally available only as optional starter templates in `packages/cli/templates/root-optional`, such as `.nvmrc`, `.dockerignore`, and `codecov.yml`. These are not applied automatically because they tend to vary more across repos.

4. Re-run the repo’s normal verification:

```sh
npm run lint
npm test
```

Also run the repo build if applicable.

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

- [devx.config.mjs](/Users/sixtopia/projects/dev-tools/devx.config.mjs) configures `devx` against the workspace packages
- [.prettierrc.cjs](/Users/sixtopia/projects/dev-tools/.prettierrc.cjs) re-exports `@thetigeregg/prettier-config`
- [commitlint.config.cjs](/Users/sixtopia/projects/dev-tools/commitlint.config.cjs) extends `@thetigeregg/commitlint-config`
- [.ncurc.cjs](/Users/sixtopia/projects/dev-tools/.ncurc.cjs) re-exports `@thetigeregg/ncu-config`

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
