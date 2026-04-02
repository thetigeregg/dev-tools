# `@thetigeregg/lint-staged-config`

Shared `lint-staged` configuration for thetigeregg repositories.

Consumer repos can use a thin root config file:

```js
module.exports = require('@thetigeregg/lint-staged-config');
```

The shared default is intentionally conservative and runs Prettier only.
If a consumer repo also wants ESLint on staged files, it should extend this config locally.
