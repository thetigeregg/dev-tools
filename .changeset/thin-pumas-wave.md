---
'@thetigeregg/dev-cli': patch
---

Fix `devx deps ncu-all`, `devx deps install-all`, and `devx deps audit-all` breaking on npm workspace members: per-directory `npm --prefix <dir>` commands can't resolve workspace-linked local packages and fail trying to fetch them from the registry. These commands now detect npm workspaces and run a single root-level `--workspaces` pass instead of looping per directory.
