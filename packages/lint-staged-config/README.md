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

You can import the shared config and add project-specific staged-file tasks.

```js
const baseConfig = require('@thetigeregg/lint-staged-config');

module.exports = {
  ...baseConfig,
  '*.{ts,tsx,js,jsx}': ['eslint --fix', 'prettier --write'],
};
```
