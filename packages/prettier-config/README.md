# `@thetigeregg/prettier-config`

Shared Prettier defaults for thetigeregg projects.

Use it from a consumer repo:

```js
module.exports = require('@thetigeregg/prettier-config');
```

## Extending this config

You can spread the shared config and apply repo-specific overrides.

```js
const baseConfig = require('@thetigeregg/prettier-config');

module.exports = {
  ...baseConfig,
  printWidth: 120,
  overrides: [
    ...(baseConfig.overrides ?? []),
    {
      files: '*.md',
      options: {
        proseWrap: 'always',
      },
    },
  ],
};
```
