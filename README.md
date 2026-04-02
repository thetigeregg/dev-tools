# `@thetigeregg/dev-tools`

Shared development tooling for thetigeregg projects.

This repository is a private monorepo for publishable internal packages. It centralizes reusable developer infrastructure so consumer repos can stay thin and project-specific.

## Packages

- `@thetigeregg/dev-cli`: the `devx` CLI for shared workflows such as task/worktree lifecycle, env reconciliation, and multi-package dependency maintenance
- `@thetigeregg/prettier-config`: shared Prettier defaults
- `@thetigeregg/commitlint-config`: shared commitlint defaults
- `@thetigeregg/ncu-config`: shared npm-check-updates policy

## Consumer Setup

Install the shared packages from your private registry:

```sh
npm install -D @thetigeregg/dev-cli @thetigeregg/prettier-config @thetigeregg/commitlint-config @thetigeregg/ncu-config
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
    sharedTemplateFile: '~/.config/game-shelf/worktree.env'
  },
  worktree: {
    adapterModule: './tools/devx/worktree-adapter.mjs'
  }
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
  extends: ['@thetigeregg/commitlint-config']
};
```

```js
// .ncurc.cjs
module.exports = require('@thetigeregg/ncu-config');
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

The release workflow is configured for OIDC-based publishing and does not require an `NPM_TOKEN`.

For the GitHub side of Changesets:

- `CHANGESETS_GITHUB_TOKEN` is required.
- It should be a PAT or GitHub App token with permission to create and update pull requests in this repo.
- The built-in `GITHUB_TOKEN` is not sufficient for this repo because release PR updates need to trigger other `pull_request` workflows.
