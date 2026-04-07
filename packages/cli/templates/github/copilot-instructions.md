# Copilot Repository Instructions

These instructions apply to GitHub Copilot when used on the GitHub platform
(pull request reviews, Copilot chat on github.com, and other GitHub AI features).

Local IDE agent rules live in `.cursor/rules/` and are managed separately.

Copilot MUST follow these instructions strictly.

## Commit Messages

Copilot MUST use the template defined in:

.github/commit-template.md

All commits MUST follow Conventional Commits:

type(scope): summary

Allowed types:

feat
fix
refactor
perf
docs
test
build
ci
chore
style

Rules:

- use lowercase type
- use present tense
- do not use vague messages
- use a scope when it adds clarity
- base content on the real diff

## Pull Requests

Copilot MUST use the template defined in:

.github/pull_request_template.md

PR titles MUST follow Conventional Commits.

PR descriptions should include:

- summary
- implementation details
- testing notes

Copilot MUST base the description on the actual changes only.

## Content Source Requirements

When generating commits or PR descriptions, Copilot MUST use:

- git diff
- staged changes
- modified files
- nearby code context

Copilot MUST NOT:

- hallucinate features
- invent changes that did not occur
- speculate beyond observable code

## Quality Expectations

Copilot should:

- follow the existing architecture and naming patterns
- prefer small deterministic edits
- avoid unrelated refactors
- keep tests and docs in sync when needed

Before suggesting final changes, Copilot should verify:

- lint passes
- tests pass
- build passes when applicable
