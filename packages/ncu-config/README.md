# `@thetigeregg/ncu-config`

Shared npm-check-updates policy for thetigeregg projects.

Use it from a consumer repo:

```js
module.exports = require('@thetigeregg/ncu-config');
```

## Extending in a consumer repo

Consumers can import the shared config and override any fields in their own
`.ncurc.cjs`.

```js
const base = require('@thetigeregg/ncu-config');

module.exports = {
  ...base,
  target: (name) => {
    if (name.startsWith('@types/')) {
      return 'minor';
    }

    return base.target(name);
  },
};
```

## npm-check-updates v23 migration notes

`npm-check-updates` v23 requires:

- Node `^22.22.2 || ^24.15.0 || >=26.0.0`
- npm `>=10`
- This package declares Node `>=24.15.0` in `engines`, so consumer repos should
  run that version floor when installing `@thetigeregg/ncu-config`

This package and its `.ncurc.cjs` usage are already aligned with v23.
If your repo already uses `.ncurc.cjs` and a compatible Node/npm toolchain, no
config changes are required.

## npm 12 hold

`npm` is pinned to `minor` (stays on the 11.x `packageManager` line) rather
than `latest`. npm 12 blocks dependency lifecycle scripts by default (opt-in
via `allowScripts`), tightens unknown-flag handling to throw instead of warn,
and defaults `allow-git`/`allow-remote` to `none`. Any of these can silently
change `npm install`/`npm ci` behavior in CI. Revisit once verified.

### Downstream checklist

- If your repo has `.ncurc.js` with `module.exports`, rename it to `.ncurc.cjs`
  (or convert to ESM `export default`).
- If you import `npm-check-updates` in ESM scripts, replace the old default
  import with one of the supported v23 forms:
  - Before: `import ncu from 'npm-check-updates'`
  - After: `import * as ncu from 'npm-check-updates'` or
    `import { run } from 'npm-check-updates'`
- Update CI/local runtime to Node/npm versions that satisfy the v23 minimums.
