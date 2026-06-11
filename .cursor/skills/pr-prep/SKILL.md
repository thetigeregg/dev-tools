---
name: pr-prep
description: >-
  Prepare a branch for pull request by running devx pr prep, fixing risks and
  test gaps, checking changesets, and generating a PR description. Use when the
  user asks to prep a PR, run devx pr prep, write a PR summary, or create a
  pull request description from the current branch.
---

# PR Prep

Analyze the branch against its base, apply safe fixes, then generate a PR title and description.

## Quick start

1. **Generate the prep prompt**

   ```bash
   npx devx pr prep
   ```

   If there are no changes vs the configured base ref, the command exits without writing a file.

   Optional: override the output path with `pr.prepOutputFile` in `devx.config.mjs`.

2. **Read the generated prompt**

   Open `prompts/pr-prep-prompt.md`. It includes pre-PR instructions, the changed-files list, and the git diff.

3. **Work through the prompt**

   Follow the generated sections in order:
   - **Change set** — use changed files and diff as source of truth
   - **Build and test health** — run repo-standard checks; fix failures introduced by the patch
   - **Patch coverage** — verify tests cover changed logic, branches, and error paths
   - **Missing tests** — add targeted tests when feasible
   - **Regression risk** — signatures, return values, queries, config defaults
   - **Security review** — validation, auth, secrets, sensitive output
   - **Deployment safety** — migrations, config, error handling
   - **Quality, performance, style** — minimal scoped improvements only
   - **Documentation and dependencies** — align docs; verify dependency updates
   - **Cleanup** — remove dead code and debug artifacts from the patch
   - **Final report** — change summary, fixes applied, coverage notes, security review, remaining risks

## Pre-PR checks and fixes

Before writing the PR description:

1. Classify the patch: feature, bug fix, refactor, dependency update, or infrastructure/config.
2. Validate risk areas: function signatures, return values, queries, and config defaults.
3. Apply the smallest targeted fix when safe; otherwise record a blocker with scope, impact, and follow-up.
4. Verify tests for changed logic, including branch and failure paths.
5. Add or update tests when feasible; document any remaining gap and why.
6. Check security, production-safety, and performance impact; mitigate or record blockers.
7. Keep all prep scoped to the current patch — no unrelated refactors.

Prefer small deterministic changes. Preserve behavior unless fixing a clear bug.

## Changeset check

Determine whether a changeset is required before generating the PR summary.

**Required when all of the following are true:**

- The branch is not a `changeset-release/` branch
- At least one file under `packages/` changed
- Those package changes include files outside `README.md`, `CHANGELOG.md`, and `test/` directories
- No `.changeset/*.md` file exists in the diff

**How to check:**

```sh
git diff --name-only "$(git merge-base HEAD main)" HEAD
```

- No `packages/` changes → no changeset needed
- Only `packages/**/README.md`, `CHANGELOG.md`, or `test/**` → no changeset needed
- A `.changeset/*.md` already in the diff → changeset present
- Otherwise → create one with `npm run changeset` and commit it before the PR summary

If the PR intentionally ships no package release, document the `no-release` label reason instead of skipping silently.

## PR summary generation

Only after prep and changeset requirements are satisfied, generate the PR description from `.github/pull_request_template.md`.

- Title must follow Conventional Commits
- Base the explanation strictly on the post-fix git diff
- Do not invent behavior or features not present in the diff
- Fill every section of the PR template
- Reflect the primary change type in the title and `Type of change` checkboxes
- In `Testing performed`, list what was actually run and what changed tests cover
- Output the Conventional Commit title and full PR template body in one code block for copy/paste

## Go/No-Go gate

Do not generate the PR summary until one of the following is true:

- All identified risks and test gaps are fixed in the patch, and the changeset requirement is satisfied (changeset present, not needed, or `no-release` documented), or
- Remaining issues are explicitly documented as blockers with scope, impact, and concrete follow-up.

## Requirements

- Repository configured with `devx.config.mjs`
- Git history with a merge base against the configured `pr.baseRef` (default `origin/main`)

Follow `.cursor/rules/pr-prep.mdc`, `.cursor/rules/commits.mdc`, and project workflow rules for verification and commits.
