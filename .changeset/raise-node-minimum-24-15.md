---
'@thetigeregg/dev-cli': major
'@thetigeregg/prettier-config': major
'@thetigeregg/commitlint-config': major
'@thetigeregg/lint-staged-config': major
'@thetigeregg/ncu-config': major
---

Raise the minimum supported Node.js version to 24.15.0 (`engines.node`). Update the optional root `.nvmrc` template to `24.15.0` so bootstrapped repos can pin the same runtime.

**Migration:** Use Node 24.15 or newer locally and in CI (for example `nvm use` with a root `.nvmrc` containing `24.15.0`).
