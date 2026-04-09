# `@thetigeregg/commitlint-config`

Shared commitlint defaults for thetigeregg projects.

Use it from a consumer repo:

```js
module.exports = {
  extends: ['@thetigeregg/commitlint-config'],
};
```

## Extending this config

You can layer additional presets and project-specific rule overrides in your repo-level `commitlint.config.cjs`.

```js
module.exports = {
  extends: ['@thetigeregg/commitlint-config'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'chore', 'refactor', 'test', 'build', 'ci', 'perf', 'style'],
    ],
    'subject-case': [0],
  },
};
```
