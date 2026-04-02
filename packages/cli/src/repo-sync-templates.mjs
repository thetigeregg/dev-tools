#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadDevxConfig } from './config.mjs';

const TEMPLATES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');

const TEMPLATE_GROUPS = [
  {
    name: 'root',
    sourceRoot: path.join(TEMPLATES_ROOT, 'root'),
    targetRoot: (repoRoot) => repoRoot,
    modes: ['bootstrap'],
  },
  {
    name: 'github',
    sourceRoot: path.join(TEMPLATES_ROOT, 'github'),
    targetRoot: (repoRoot) => path.join(repoRoot, '.github'),
    modes: ['bootstrap', 'sync'],
    syncExcludes: new Set(['copilot-instructions.md']),
  },
];

function collectTemplateFiles(rootDir, currentDir = rootDir) {
  const entries = readdirSync(currentDir).sort();
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry);
    const entryStat = statSync(absolutePath);

    if (entryStat.isDirectory()) {
      files.push(...collectTemplateFiles(rootDir, absolutePath));
      continue;
    }

    files.push({
      relativePath: path.relative(rootDir, absolutePath),
      absolutePath,
    });
  }

  return files;
}

function normalizeTemplateRoot(templateRoot) {
  return templateRoot instanceof URL ? fileURLToPath(templateRoot) : templateRoot;
}

export function buildTemplateSyncPlan({
  repoRoot,
  mode = 'sync',
  groups = TEMPLATE_GROUPS,
} = {}) {
  const plan = [];

  for (const group of groups) {
    if (!group.modes.includes(mode)) {
      continue;
    }

    const normalizedSourceRoot = normalizeTemplateRoot(group.sourceRoot);
    const targetRoot =
      typeof group.targetRoot === 'function' ? group.targetRoot(repoRoot) : group.targetRoot;
    const syncExcludes = group.syncExcludes ?? new Set();

    for (const template of collectTemplateFiles(normalizedSourceRoot)) {
      if (mode === 'sync' && syncExcludes.has(template.relativePath)) {
        continue;
      }

      const targetPath = path.join(targetRoot, template.relativePath);
      plan.push({
        group: group.name,
        sourcePath: template.absolutePath,
        targetPath,
        relativeTargetPath: path.relative(repoRoot, targetPath),
      });
    }
  }

  return plan;
}

export function syncTemplates({
  plan,
  dryRun = false,
  skipExisting = false,
  log = console.log,
  mkdir = mkdirSync,
  copyFile = copyFileSync,
  exists = existsSync,
} = {}) {
  if (!plan || plan.length === 0) {
    return { fileCount: 0, wroteFiles: false, skippedCount: 0 };
  }

  log(
    dryRun
      ? 'Template sync dry run:'
      : skipExisting
        ? 'Bootstrapping shared templates and config stubs:'
        : 'Syncing shared templates:'
  );

  let skippedCount = 0;

  for (const item of plan) {
    if (skipExisting && exists(item.targetPath)) {
      skippedCount += 1;
      log(`- ${item.relativeTargetPath} (skipped existing)`);
      continue;
    }

    log(`- ${item.relativeTargetPath}`);

    if (dryRun) {
      continue;
    }

    mkdir(path.dirname(item.targetPath), { recursive: true });
    copyFile(item.sourcePath, item.targetPath);
  }

  return {
    fileCount: plan.length,
    wroteFiles: !dryRun,
    skippedCount,
  };
}

async function runRepoTemplateCommand({
  cwd = process.cwd(),
  argv = process.argv.slice(2),
  mode = 'sync',
} = {}) {
  const config = await loadDevxConfig({ cwd });
  const dryRun = argv.includes('--dry-run');
  const plan = buildTemplateSyncPlan({ repoRoot: config.repoRoot, mode });

  for (const group of TEMPLATE_GROUPS) {
    if (group.modes.includes(mode) && !existsSync(group.sourceRoot)) {
      throw new Error(`Shared template root not found: ${group.sourceRoot}`);
    }
  }

  const result = syncTemplates({
    plan,
    dryRun,
    skipExisting: mode === 'bootstrap',
  });

  if (!dryRun) {
    console.log(
      `\n${mode === 'bootstrap' ? 'Bootstrapped' : 'Synced'} ${result.fileCount - result.skippedCount} files${result.skippedCount > 0 ? ` (${result.skippedCount} existing skipped)` : ''}.`
    );
  }

  return result;
}

export async function runRepoBootstrapCli(options = {}) {
  return runRepoTemplateCommand({ ...options, mode: 'bootstrap' });
}

export async function runRepoSyncCli(options = {}) {
  return runRepoTemplateCommand({ ...options, mode: 'sync' });
}

export async function runRepoSyncTemplatesCli(options = {}) {
  return runRepoSyncCli(options);
}

export function isEntrypoint({ argv1 = process.argv[1], moduleUrl = import.meta.url } = {}) {
  if (!argv1) {
    return false;
  }

  return pathToFileURL(path.resolve(argv1)).href === moduleUrl;
}

if (isEntrypoint()) {
  await runRepoSyncTemplatesCli();
}
