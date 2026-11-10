---
'@thetigeregg/dev-cli': minor
---

`devx pr feedback` now includes each inline review task's thread ID in the generated prompt, as `[thread: <id>]`. The seeded `/pr-feedback` command uses these IDs to resolve fixed threads directly. It no longer re-queries the threads or matches them by path and line, which breaks once a push makes a thread outdated. The CI status line now shows how many checks were skipped or neutral. Check-run status and conclusion are matched case-insensitively.

The seeded `/pr-prep` command now opens the PR against `baseBranch` when `pr.baseRef` is unset. It only reuses an existing PR if that PR is open. The seeded `/pr-feedback` command passes only the PR number to its `gh` calls, so extra flags no longer break them. The `CLAUDE.md` template notes that running either command counts as asking to commit.
