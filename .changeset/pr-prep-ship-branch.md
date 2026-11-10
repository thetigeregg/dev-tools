---
'@thetigeregg/dev-cli': minor
---

Extend the seeded Claude Code `/pr-prep` command to ship the branch after prep. It commits with the suggested Conventional Commit message, pushes and sets the upstream if needed, and creates the PR with `gh` using the generated title and body. It then links to the PR. If the branch already has an open PR, the command links to it instead of creating a duplicate.
