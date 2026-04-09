# `@thetigeregg/lint-staged-config`

Shared `lint-staged` configuration for thetigeregg repositories.

Install `prettier` in the consumer repo alongside this package because the shared staged-file command runs `prettier --write`.

Consumer repos can use a thin root config file:

```js
module.exports = require('@thetigeregg/lint-staged-config');
```

The shared default is intentionally conservative and runs Prettier only.
If a consumer repo also wants ESLint on staged files, it should extend this config locally.

## Extending this config

You can import the shared config and replace the shared TS/JS glob with
project-specific staged-file tasks.

```js
const baseConfig = require('@thetigeregg/lint-staged-config');
const extendedConfig = { ...baseConfig };

delete extendedConfig['*.{ts,js,mjs,cjs,jsx,tsx,html,css,scss,md,mdx,json,yml,yaml}'];

module.exports = {
  ...extendedConfig,
  '*.{ts,tsx,js,jsx}': ['eslint --fix', 'prettier --write'],
};
```
