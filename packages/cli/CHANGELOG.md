# @thetigeregg/dev-cli

## 2.0.1

### Patch Changes

- 05e4d05: Sync generated repository templates with current commit workflow guidance by adding the `commit-message-output` rule and updating Husky hooks to remove deprecated bootstrap lines.

## 2.0.0

### Major Changes

- fae05f4: Renamed PR prompt workflows: `devx pr prep` now writes `prompts/pr-prep-prompt.md` and
  `devx pr feedback` now writes `prompts/pr-feedback-prompt.md`. The CLI creates the
  `prompts/` directory when missing. Override with `pr.prepOutputFile` and
  `pr.feedbackOutputFile` in `devx.config.mjs`.

  Migration notes:
  - Replace `devx pr review` with `devx pr prep`
  - Replace `devx pr agent` with `devx pr feedback`
  - Rename config keys:
    - `pr.reviewOutputFile` -> `pr.prepOutputFile`
    - `pr.agentOutputFile` -> `pr.feedbackOutputFile`
  - If referenced directly, rename generated prompt paths:
    - `prompts/pr-review-prompt.md` -> `prompts/pr-prep-prompt.md`
    - `prompts/pr-agent-prompt.md` -> `prompts/pr-feedback-prompt.md`

## 1.1.0

### Minor Changes

- fae05f4: Default output paths for `devx pr review` and `devx pr agent` are now `prompts/pr-review-prompt.md` and `prompts/pr-agent-prompt.md`. The CLI creates the `prompts/` directory when missing. Override with `pr.reviewOutputFile` and `pr.agentOutputFile` in `devx.config.mjs`. Repositories should add `prompts/` to `.gitignore` and may remove legacy `.pr-review-prompt.md` / `.pr-agent-prompt.md` ignore rules.

## 1.0.1

### Patch Changes

- d6bd8e0: embed pre-pr review instructions in summary prompt

## 1.0.0

### Major Changes

- f5fdeea: Rename the CLI/config naming from `pr summary` to `pr review`.

## 0.6.0

### Minor Changes

- a6326a4: switch to support Cursor

## 0.5.0

### Minor Changes

- 8dc913e: add the `devx github sarif pull` command

## 0.4.5

### Patch Changes

- ad40dc5: bump versions in lock

## 0.4.4

### Patch Changes

- 3d89021: Harden git command execution and path normalization

## 0.4.3

### Patch Changes

- 28c6e8d: fix release

## 0.4.2

### Patch Changes

- 4ee614e: bump

## 0.4.1

### Patch Changes

- 4ffb722: align repository urls

## 0.4.0

### Minor Changes

- b02deb1: format code
- da974db: Introduce new devx commands, shared templates, and a release helper by migrating the remaining CLI logic into @thetigeregg/dev-cli and @thetigeregg/lint-staged-config.

## 0.3.0

### Minor Changes

- 7aaed9c: update naming

## 0.2.1

### Patch Changes

- 5f92442: Prepare additional workspace packages for first public npm release with MIT licensing and public publish access.

## 0.2.0

### Minor Changes

- 2008153: Make the shared tooling workspace publish-ready with package metadata, docs, tests, CI, and Changesets-based release automation.
