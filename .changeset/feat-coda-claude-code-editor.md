---
'@thetigeregg/dev-cli': minor
---

Add Claude Code support and configurable editor for task start. Bootstraps CLAUDE.md and `.claude/commands/` slash commands via `repo bootstrap`; during `repo sync`, CLAUDE.md is skipped if it already exists (so project-specific customisations are preserved). The `devx task start` editor auto-open now works on all platforms and respects an optional `editor.command` in `devx.config.mjs`.
