# @thetigeregg/lint-staged-config

## 1.0.0

### Major Changes

- ae2c667: Raise the minimum supported Node.js version to 24.14.0 (`engines.node`). Update the optional root `.nvmrc` template to `24.14.0` so bootstrapped repos can pin the same runtime.

  **Migration:** Use Node 24.14 or newer locally and in CI (for example `nvm use` with a root `.nvmrc` containing `24.14.0`).

## 0.2.5

### Patch Changes

- 14a9504: add docs, change ncu default

## 0.2.4

### Patch Changes

- ad40dc5: bump versions in lock

## 0.2.3

### Patch Changes

- 28c6e8d: fix release

## 0.2.2

### Patch Changes

- 4ee614e: bump

## 0.2.1

### Patch Changes

- 4ffb722: align repository urls

## 0.2.0

### Minor Changes

- b02deb1: format code
- da974db: Introduce new devx commands, shared templates, and a release helper by migrating the remaining CLI logic into @thetigeregg/dev-cli and @thetigeregg/lint-staged-config.
