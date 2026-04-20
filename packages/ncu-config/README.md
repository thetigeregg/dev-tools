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

## npm-check-updates v21 migration notes

`npm-check-updates` v21 requires:

- Node `^20.19.0 || ^22.12.0 || >=24.0.0`
- npm `>=10`

This package and its `.ncurc.cjs` usage are already aligned with v21.
If your repo already uses `.ncurc.cjs` and a compatible Node/npm toolchain, no
config changes are required.

### Downstream checklist

- If your repo has `.ncurc.js` with `module.exports`, rename it to `.ncurc.cjs`
  (or convert to ESM `export default`).
- If you import `npm-check-updates` in ESM scripts, replace default import usage:
  - `import ncu from 'npm-check-updates'`
  - `import * as ncu from 'npm-check-updates'` or `import { run } from 'npm-check-updates'`
- Update CI/local runtime to Node/npm versions that satisfy the v21 minimums.
