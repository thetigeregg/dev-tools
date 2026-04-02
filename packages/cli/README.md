# `@thetigeregg/dev-cli`

Shared CLI for TheTigerEgg repository setup and maintenance workflows.

## Commands

```sh
devx task start <name>
devx worktree cleanup [--auto] [--dry-run]
devx worktree <adapter-command> [...]
devx env reconcile
devx deps audit-all [--fix]
devx deps ncu-all
```

## Config Contract

The CLI searches upward for `devx.config.mjs` and uses it to resolve:

- repository root
- branch and worktree defaults
- package directories for multi-package commands
- env file locations
- optional worktree adapter hooks

`worktree.adapterModule` is optional. When present:

- `runWorktreeDev(argv, options?)` powers `devx worktree ...`
- `bootstrapWorktree(context)` can run project-specific setup during `devx task start`
