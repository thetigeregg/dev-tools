---
name: pr-feedback
description: >-
  Work through PR review feedback by generating a feedback prompt with devx and
  resolving CI failures, coverage gaps, and review comments. Use when the user
  asks to address PR feedback, fix review comments, triage CI failures on a PR,
  or run devx pr feedback.
---

# PR Feedback

Resolve CI failures, coverage gaps, and review comments on a pull request.

## Quick start

1. **Generate the feedback prompt**

   Run with the PR number:

   ```bash
   npx devx pr feedback <PR_NUMBER>
   ```

   If the user did not provide a PR number, resolve it from the current branch:

   ```bash
   gh pr view --json number -q .number
   ```

   Optional flags:
   - `--copilot-only` — only Copilot-authored review threads
   - `--include-coverage` — download coverage artifacts even when coverage checks pass
   - `--debug` — log `gh` commands (`DEBUG_PR_FEEDBACK=1` also works)

2. **Read the generated prompt**

   Open `prompts/pr-feedback-prompt.md`. Override the path with `pr.feedbackOutputFile` in `devx.config.mjs`.

3. **Work through the prompt**

   Follow the generated sections in order:
   - **Current Status** — CI, coverage, and review state; use the Focus line to prioritize
   - **CI Failure Tasks** — failing jobs with relevant logs
   - **Coverage Tasks** — uncovered lines in changed files
   - **Inline Review Tasks** — unresolved line comments with diffs
   - **General Review Notes** — discussion-level feedback
   - **Pending Checks** — wait or re-check before assuming done
   - **Definition of Done** — local verify commands to run before finishing
   - **Pull Request Diff** — context for scoped fixes

## Fix strategy

Work through priorities in this order:

1. Fix CI failures
2. Fix failing tests
3. Address uncovered code in changed files
4. Resolve unresolved review comments
5. Ensure linting and build succeed

Always fix root causes rather than suppressing errors.
Avoid unrelated refactors.

## Definition of done

The pull request is complete only when all required checks and review feedback are resolved.

Before finishing:

- Run every verify command listed in the generated prompt's Definition of Done section
- Follow `.cursor/rules/pr-feedback.mdc` and project workflow rules for commits

## Requirements

- `gh` CLI installed and authenticated
- Repository configured with `devx.config.mjs`
