import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTemplateSyncPlan, syncTemplates } from '../src/repo-sync-templates.mjs';

test('buildTemplateSyncPlan maps shared github templates into repo .github paths for sync', () => {
  const plan = buildTemplateSyncPlan({
    repoRoot: '/repo',
    mode: 'sync',
    groups: [
      {
        name: 'root-shared',
        sourceRoot: new URL('../templates/root-shared', import.meta.url),
        targetRoot: (repoRoot) => repoRoot,
        modes: ['bootstrap', 'sync'],
        syncExcludes: new Set(['lint-staged.config.cjs']),
      },
      {
        name: 'github',
        sourceRoot: new URL('../templates/github', import.meta.url),
        targetRoot: (repoRoot) => `${repoRoot}/.github`,
        modes: ['bootstrap', 'sync'],
        syncExcludes: new Set(['copilot-instructions.md']),
      },
    ],
  });

  assert.ok(plan.some((item) => item.relativeTargetPath === '.husky/pre-commit'));
  assert.ok(plan.some((item) => item.relativeTargetPath === '.editorconfig'));
  assert.ok(plan.some((item) => item.relativeTargetPath === '.prettierignore'));
  assert.ok(plan.some((item) => item.relativeTargetPath === '.gitleaks.toml'));
  assert.ok(plan.some((item) => item.relativeTargetPath === '.github/pull_request_template.md'));
  assert.ok(plan.some((item) => item.relativeTargetPath === '.github/ISSUE_TEMPLATE/bug.yml'));
  assert.ok(!plan.some((item) => item.relativeTargetPath === '.github/copilot-instructions.md'));
  assert.ok(!plan.some((item) => item.relativeTargetPath === 'lint-staged.config.cjs'));
});

test('buildTemplateSyncPlan includes root stubs and defaults during bootstrap', () => {
  const plan = buildTemplateSyncPlan({
    repoRoot: '/repo',
    mode: 'bootstrap',
    groups: [
      {
        name: 'root',
        sourceRoot: new URL('../templates/root', import.meta.url),
        targetRoot: (repoRoot) => repoRoot,
        modes: ['bootstrap'],
      },
      {
        name: 'root-shared',
        sourceRoot: new URL('../templates/root-shared', import.meta.url),
        targetRoot: (repoRoot) => repoRoot,
        modes: ['bootstrap', 'sync'],
        syncExcludes: new Set(['lint-staged.config.cjs']),
      },
      {
        name: 'github',
        sourceRoot: new URL('../templates/github', import.meta.url),
        targetRoot: (repoRoot) => `${repoRoot}/.github`,
        modes: ['bootstrap', 'sync'],
        syncExcludes: new Set(['copilot-instructions.md']),
      },
    ],
  });

  assert.ok(plan.some((item) => item.relativeTargetPath === 'AGENTS.md'));
  assert.ok(plan.some((item) => item.relativeTargetPath === '.prettierrc.cjs'));
  assert.ok(plan.some((item) => item.relativeTargetPath === 'devx.config.mjs'));
  assert.ok(plan.some((item) => item.relativeTargetPath === 'lint-staged.config.cjs'));
  assert.ok(plan.some((item) => item.relativeTargetPath === '.husky/commit-msg'));
  assert.ok(plan.some((item) => item.relativeTargetPath === '.editorconfig'));
  assert.ok(plan.some((item) => item.relativeTargetPath === '.prettierignore'));
  assert.ok(plan.some((item) => item.relativeTargetPath === '.gitleaks.toml'));
  assert.ok(plan.some((item) => item.relativeTargetPath === '.github/copilot-instructions.md'));
});

test('syncTemplates copies planned files, supports dry-run, and can skip existing files', () => {
  const writes = [];
  const mkdirs = [];
  const existingFiles = new Set(['/repo/.github/pull_request_template.md']);
  const plan = [
    {
      sourcePath: '/templates/github/pull_request_template.md',
      targetPath: '/repo/.github/pull_request_template.md',
      relativeTargetPath: '.github/pull_request_template.md',
    },
    {
      sourcePath: '/templates/root/AGENTS.md',
      targetPath: '/repo/AGENTS.md',
      relativeTargetPath: 'AGENTS.md',
    },
  ];

  const dryRunResult = syncTemplates({
    plan,
    dryRun: true,
    log() {},
    mkdir() {
      mkdirs.push('dry-run');
    },
    copyFile() {
      writes.push('dry-run');
    },
  });

  assert.deepEqual(dryRunResult, { fileCount: 2, wroteFiles: false, skippedCount: 0 });
  assert.deepEqual(mkdirs, []);
  assert.deepEqual(writes, []);

  const result = syncTemplates({
    plan,
    skipExisting: true,
    log() {},
    exists(targetPath) {
      return existingFiles.has(targetPath);
    },
    mkdir(directoryPath, options) {
      mkdirs.push({ directoryPath, options });
    },
    copyFile(sourcePath, targetPath) {
      writes.push({ sourcePath, targetPath });
    },
  });

  assert.deepEqual(result, { fileCount: 2, wroteFiles: true, skippedCount: 1 });
  assert.deepEqual(mkdirs, [{ directoryPath: '/repo', options: { recursive: true } }]);
  assert.deepEqual(writes, [
    {
      sourcePath: '/templates/root/AGENTS.md',
      targetPath: '/repo/AGENTS.md',
    },
  ]);
});
