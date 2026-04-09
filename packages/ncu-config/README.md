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
