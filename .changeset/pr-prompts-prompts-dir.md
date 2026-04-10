---
'@thetigeregg/dev-cli': major
---

Renamed PR prompt workflows: `devx pr prep` now writes `prompts/pr-prep-prompt.md` and
`devx pr feedback` now writes `prompts/pr-feedback-prompt.md`. The CLI creates the
`prompts/` directory when missing. Override with `pr.prepOutputFile` and
`pr.feedbackOutputFile` in `devx.config.mjs`.

Migration notes:

- Replace `devx pr review` with `devx pr prep`
- Replace `devx pr agent` with `devx pr feedback`
- Rename config keys:
  - `pr.reviewOutputFile` -> `pr.prepOutputFile`
  - `pr.agentOutputFile` -> `pr.feedbackOutputFile`
- If referenced directly, rename generated prompt paths:
  - `prompts/pr-review-prompt.md` -> `prompts/pr-prep-prompt.md`
  - `prompts/pr-agent-prompt.md` -> `prompts/pr-feedback-prompt.md`
