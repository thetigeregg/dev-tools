---
'@thetigeregg/dev-cli': minor
---

Default output paths for `devx pr review` and `devx pr agent` are now `prompts/pr-review-prompt.md` and `prompts/pr-agent-prompt.md`. The CLI creates the `prompts/` directory when missing. Override with `pr.reviewOutputFile` and `pr.agentOutputFile` in `devx.config.mjs`. Repositories should add `prompts/` to `.gitignore` and may remove legacy `.pr-review-prompt.md` / `.pr-agent-prompt.md` ignore rules.
