---
'@thetigeregg/dev-cli': patch
---

Fix `devx task start` not installing dependencies correctly in the new worktree: dependency installation previously happened inside the project's `bootstrapWorktree` adapter as a hardcoded `npm ci`, ignoring `worktree.bootstrap.installScript` and workspace-aware install logic. `devx task start` now installs dependencies itself via the shared worktree engine (respecting `worktree.bootstrap.installScript` and npm workspaces) before running the adapter's bootstrap hook, and exits with a clear error and actionable message if install fails. The built-in adapter's `bootstrapWorktree` is now a no-op since install is handled upstream.
