---
'@thetigeregg/dev-cli': patch
---

Fix `devx pr feedback` reporting passing PRs as failing CI:

- Skipped and neutral check runs no longer count as CI or coverage failures. GitHub doesn't treat them as merge-blocking either. They are now returned in a new `skipped` bucket from `analyzeChecks`.
- Commit status contexts such as `codecov/patch` are now classified by their `state`. Before this fix they always appeared as pending, even after they passed.
