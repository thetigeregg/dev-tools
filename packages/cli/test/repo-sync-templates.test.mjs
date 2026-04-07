import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertTemplateRootsExist,
  buildTemplateSyncPlan,
  runRepoBootstrapCli,
  runRepoSyncCli,
  syncTemplates,
} from '../src/repo-sync-templates.mjs';

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
  assert.ok(plan.some((item) => item.relativeTargetPath === '.cursor/rules/commits.mdc'));
  assert.ok(plan.some((item) => item.relativeTargetPath === '.cursor/rules/code.mdc'));
  assert.ok(plan.some((item) => item.relativeTargetPath === '.cursor/rules/pr-review.mdc'));
  assert.ok(plan.some((item) => item.relativeTargetPath === '.cursor/rules/pr-agent.mdc'));
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

  assert.ok(plan.some((item) => item.relativeTargetPath === '.cursor/rules/workflow.mdc'));
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
      sourcePath: '/templates/root/.cursor/rules/workflow.mdc',
      targetPath: '/repo/.cursor/rules/workflow.mdc',
      relativeTargetPath: '.cursor/rules/workflow.mdc',
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
  assert.deepEqual(mkdirs, [
    { directoryPath: '/repo/.cursor/rules', options: { recursive: true } },
  ]);
  assert.deepEqual(writes, [
    {
      sourcePath: '/templates/root/.cursor/rules/workflow.mdc',
      targetPath: '/repo/.cursor/rules/workflow.mdc',
    },
  ]);
});

test('syncTemplates reports wroteFiles false when every file is skipped', () => {
  const result = syncTemplates({
    plan: [
      {
        sourcePath: '/templates/root/.cursor/rules/workflow.mdc',
        targetPath: '/repo/.cursor/rules/workflow.mdc',
        relativeTargetPath: '.cursor/rules/workflow.mdc',
      },
    ],
    skipExisting: true,
    log() {},
    exists() {
      return true;
    },
  });

  assert.deepEqual(result, { fileCount: 1, wroteFiles: false, skippedCount: 1 });
});

test('assertTemplateRootsExist throws a clear error before plan building when a source root is missing', () => {
  assert.throws(
    () =>
      assertTemplateRootsExist({
        mode: 'sync',
        groups: [
          {
            name: 'github',
            sourceRoot: '/missing/templates/github',
            modes: ['sync'],
          },
        ],
        exists() {
          return false;
        },
      }),
    /Shared template root not found: \/missing\/templates\/github/
  );
});

test('runRepoBootstrapCli falls back to cwd when devx.config.mjs is missing', async () => {
  const calls = [];

  const result = await runRepoBootstrapCli({
    cwd: '/repo',
    argv: ['--dry-run'],
    groups: [
      {
        name: 'root',
        sourceRoot: new URL('../templates/root', import.meta.url),
        targetRoot: (repoRoot) => repoRoot,
        modes: ['bootstrap'],
      },
    ],
    loadConfig() {
      throw new Error('Unable to find devx.config.mjs from /repo');
    },
    log(message) {
      calls.push(message);
    },
  });

  assert.equal(result.fileCount > 0, true);
  assert.equal(result.wroteFiles, false);
  assert.match(calls[0], /Template sync dry run:/);
  assert.ok(calls.some((message) => message === '- .cursor/rules/workflow.mdc'));
});

test('runRepoSyncCli honors --repo-root when devx.config.mjs is missing', async () => {
  const calls = [];

  const result = await runRepoSyncCli({
    cwd: '/workspace',
    argv: ['--dry-run', '--repo-root', 'packages/example'],
    groups: [
      {
        name: 'github',
        sourceRoot: new URL('../templates/github', import.meta.url),
        targetRoot: (repoRoot) => `${repoRoot}/.github`,
        modes: ['sync'],
      },
    ],
    loadConfig() {
      throw new Error('Unable to find devx.config.mjs from /workspace');
    },
    log(message) {
      calls.push(message);
    },
  });

  assert.equal(result.fileCount > 0, true);
  assert.equal(result.wroteFiles, false);
  assert.ok(calls.some((message) => message === '- .github/pull_request_template.md'));
});
