---
'@thetigeregg/dev-cli': patch
---

Fix `devx worktree cleanup` missing squash and rebase merges: it previously relied solely on `git branch --merged` ancestry, which only recognizes true merge-commit merges. It now also checks patch-id equivalence via `git cherry` (for rebase merges) and against a synthetic commit built from each branch's total diff (for squash merges), so squash/rebase-merged branches and their worktrees are cleaned up too. Set `worktree.detectSquashRebase: false` in `devx.config.mjs` to opt out and keep ancestry-only detection.
