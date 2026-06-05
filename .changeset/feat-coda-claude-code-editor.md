---
'@thetigeregg/dev-cli': minor
---

Add Claude Code support and configurable editor for task start. Bootstraps CLAUDE.md and `.claude/commands/` slash commands via `repo bootstrap`; CLAUDE.md is excluded from overwrite during `repo sync`. The `devx task start` editor auto-open now works on all platforms and respects an optional `editor.command` in `devx.config.mjs`.
