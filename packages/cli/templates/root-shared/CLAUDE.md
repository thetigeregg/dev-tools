# Workflow

Before suggesting any commit:

1. Run `<test-command>` to execute tests
2. Run `<format-command>` to verify formatting
3. Do not bypass pre-commit hooks
4. If any step fails, fix the issue before proceeding

<!-- TODO: Replace <test-command> and <format-command> with this project's actual commands -->

# Code Quality

- Follow the existing architecture — do not introduce new patterns without discussion
- Prefer strict typing where applicable
- Formatting is enforced by Prettier — do not manually reformat, let the pre-commit hook handle it
- Do not bypass lint-staged or tests without explicit explanation
- This is a monorepo — changes should be scoped to the relevant workspace

# Commits

## Commit format

type(scope): description

Allowed types: feat, fix, refactor, perf, docs, test, build, ci, chore, style

Examples:

- feat(ui): add settings page
- fix(api): handle missing platform mapping
- refactor(service): simplify sync logic

Rules:

- Avoid vague commit messages
- Commit messages are validated by commitlint via `.husky/commit-msg`
- commitlint config is in `commitlint.config.cjs`

## PR titles

Must follow Conventional Commits format.

## PR descriptions must include:

- Summary
- Implementation details
- Testing notes

# Commit Message Output

When code changes were made and the task is complete:

- Always include a suggested Conventional Commit message in the final response.
- Follow the format from the Commits section above: `type(scope): description`.
- If no code changes were made, do not include a commit message.
- Do not run `git commit` unless the user explicitly asks.

Before suggesting a commit message, complete the Workflow verification steps first.

# PR Prep

## PR Description

Generate a pull request description using the repository template at:
`.github/pull_request_template.md`

### Requirements

- Title must follow Conventional Commits
- Base the explanation strictly on the current git diff after prep fixes
- Do NOT invent behavior or features not present in the diff
- Fill every section of the PR template
- Be technically precise and concise
- Output the final PR title and PR summary body in one combined code block for copy/paste

## Pre-PR Prep

Complete prep in this order before writing the PR description:

### Step 1: Pre-PR checks and fixes

1. Classify the patch as one primary type: feature, bug fix, refactor, dependency update, or infrastructure/config.
2. Validate risk areas changed by the patch: function signatures, return values, queries, and config defaults.
3. If a risk is found, apply the smallest targeted fix in the patch. If a safe fix cannot be made now, record a blocker with exact scope, impact, and owner.
4. Verify tests for changed logic, including branch and failure paths that were touched.
5. If test coverage is missing for a changed path, add or update tests when feasible in-scope. If not feasible, record the exact remaining gap and why.
6. Check for security, production-safety, and performance impact from the patch. Mitigate issues in code/config now when feasible; otherwise record a blocker with concrete follow-up.
7. Keep all prep work scoped to the current patch and avoid unrelated refactors.

### Step 2: PR summary generation

Only after Step 1 is complete, generate the PR description from the repository template.

- Use the post-fix diff as source of truth.
- Reflect the primary change type in both the Conventional Commit title and `Type of change` checkboxes.
- In `Testing performed`, list what was actually run and what changed tests cover.
- Format output for easy copy/paste:
  - return `Title` followed by `Summary` in a single code block
  - include the Conventional Commit title line and full PR template body in that same block

### Go/No-Go gate

Do not generate the PR summary until one of the following is true:

- All identified risks and test gaps are fixed in the patch, or
- Remaining issues are explicitly documented as blockers with scope, impact, and concrete follow-up.

# PR Feedback

## Fix Strategy

Work through the following priorities in order:

1. Fix CI failures
2. Fix failing tests
3. Address uncovered code in changed files
4. Resolve unresolved review comments
5. Ensure linting and build succeed

Always fix root causes rather than suppressing errors.
Avoid unrelated refactors.

## Definition of Done

The pull request is complete only when all required checks
and review feedback are resolved.

Before finishing, verify locally using the commands listed
in the generated prompt's Definition of Done section.
