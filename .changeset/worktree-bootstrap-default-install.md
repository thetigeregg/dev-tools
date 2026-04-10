---
'@thetigeregg/dev-cli': major
---

**Semver major is intentional:** default worktree bootstrap install behavior and the `buildNvmAwareInstallCommand` parameter contract change in ways that require migration for some consumers (see below). The PR is labeled `fix` because it corrects bootstrap defaults; the breaking impact is still a major release per semver.

Change worktree bootstrap dependency installation when `worktree.bootstrap.installScript` is omitted: run `npm ci --workspaces --include-workspace-root` instead of defaulting to `npm run deps:ci-all`. Optional `installScript` still runs `npm run <script>`.

`buildNvmAwareInstallCommand` now takes a full shell install command (default `npm ci --workspaces --include-workspace-root`) instead of an npm script name wrapped with `npm run`.

**Migration**

- If you relied on the old implicit default, set `worktree.bootstrap.installScript` to your script name (for example `deps:ci-all`) in `devx.config.mjs`.
- If you import `buildNvmAwareInstallCommand` and pass only a script name, pass `npm run <script>` instead.
- The workspace default `npm ci --workspaces --include-workspace-root` requires a root `package-lock.json` and a non-empty npm `workspaces` configuration in the root `package.json`. Repositories that are not npm workspaces get a per-`packageDir` `npm ci` chain instead; if neither behavior works for you, set `worktree.bootstrap.installScript` explicitly.
