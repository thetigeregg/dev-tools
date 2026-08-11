---
'@thetigeregg/ncu-config': minor
---

Pin `npm` to `minor` upgrades (stay on the 11.x `packageManager` line) instead of `latest`. npm 12 blocks dependency lifecycle scripts by default, tightens unknown-flag handling to throw instead of warn, and defaults `allow-git`/`allow-remote` to `none` — any of these can silently change `npm install`/`npm ci` behavior in CI. Revisit once verified against CI.
