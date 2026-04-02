# AI Agent Instructions

Agents MUST verify build, lint, and tests before suggesting commits.

This repository uses Conventional Commits.

## Commit format

type(scope): description

Examples:

feat(ui): add settings page
fix(api): handle missing platform mapping
refactor(service): simplify sync logic

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

## Pull requests

PR titles MUST follow Conventional Commits.

PR descriptions should include:

- summary
- implementation details
- testing notes

## Code rules

- Follow the existing architecture
- Prefer strict typing where applicable
- Avoid vague commit messages
- Do not bypass lint or tests without explanation
