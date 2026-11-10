---
'@thetigeregg/dev-cli': minor
---

Extend the seeded Claude Code `/pr-feedback` command to ship its fixes. It commits with the suggested Conventional Commit message, then pushes and sets the upstream if needed. After the push, it resolves only the review threads the pushed fixes fully address, using `gh api graphql`. It then links to the PR and reports which threads it resolved and which it left open.
