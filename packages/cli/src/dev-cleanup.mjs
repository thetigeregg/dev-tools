#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadDevxConfig } from './config.mjs';

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const IGNORABLE_DIRECTORY_ENTRIES = new Set(['.DS_Store', '.localized', 'Thumbs.db']);

export function trimTrailingPathSeparators(pathValue, pathModule = path) {
  const normalizedRoot = pathModule.parse(pathValue).root.replace(/\\/g, '/');
  const minimumLength = normalizedRoot.length || 1;
  const trailingSeparators = new Set(['/', '\\']);
  if (pathModule.sep) {
    trailingSeparators.add(pathModule.sep);
  }
  let end = pathValue.length;

  while (end > minimumLength && trailingSeparators.has(pathValue[end - 1])) {
    end--;
  }

  return pathValue.slice(0, end);
}

function normalizePathForCompare(pathValue) {
  let resolved = path.resolve(pathValue);

  try {
    resolved = realpathSync(resolved);
  } catch {
    // Keep resolved path when realpath lookup fails.
  }

  return trimTrailingPathSeparators(resolved.replace(/\\/g, '/'));
}

function normalizePathForMatch(pathValue) {
  const normalizedPath = normalizePathForCompare(pathValue);
  return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
}

function getCurrentWorktreePath() {
  try {
    const toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      maxBuffer: DEFAULT_MAX_BUFFER,
    }).trim();

    if (toplevel) {
      return normalizePathForCompare(toplevel);
    }
  } catch {
    // Fallback to process.cwd() if git detection fails.
  }

  return normalizePathForCompare(process.cwd());
}

function getCommonGitDir(currentWorktreePath) {
  try {
    const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      encoding: 'utf8',
      maxBuffer: DEFAULT_MAX_BUFFER,
    }).trim();

    if (commonDir) {
      return normalizePathForCompare(commonDir);
    }
  } catch {
    // Fallback to current worktree when common git dir detection fails.
  }

  return normalizePathForCompare(path.join(currentWorktreePath, '.git'));
}

function getCommonRepoRoot(commonGitDir) {
  return normalizePathForCompare(path.resolve(commonGitDir, '..'));
}

function runGit(args, options = {}) {
  const { exitOnError = true, ...execOptions } = options;

  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: DEFAULT_MAX_BUFFER,
      ...execOptions,
    });
  } catch (error) {
    const commandString = ['git', ...args].join(' ');
    console.error(`Command failed: ${commandString}`);

    if (error && typeof error === 'object' && 'stderr' in error && error.stderr) {
      try {
        process.stderr.write(String(error.stderr));
      } catch {
        // Ignore stderr write failures.
      }
    }

    if (!exitOnError) {
      throw error;
    }

    let exitCode = 1;
    if (error && typeof error === 'object') {
      if (typeof error.status === 'number') {
        exitCode = error.status;
      } else if (typeof error.code === 'number') {
        exitCode = error.code;
      }
    }

    process.exit(exitCode);
  }
}

function gitCommandSucceeds(args, options = {}) {
  try {
    execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: DEFAULT_MAX_BUFFER,
      stdio: 'ignore',
      ...options,
    });
    return true;
  } catch {
    return false;
  }
}

function isWorktreeClean(worktreePath) {
  try {
    const status = runGit(['-C', worktreePath, 'status', '--porcelain'], {
      exitOnError: false,
    }).trim();
    return status.length === 0;
  } catch {
    return false;
  }
}

export function parseWorktrees(worktreesOutput) {
  return worktreesOutput
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((entry) => {
      const pathMatch = entry.match(/^worktree\s+(.+)$/m);
      const branchMatch = entry.match(/^branch\s+refs\/heads\/(.+)$/m);

      return {
        path: pathMatch?.[1]?.trim(),
        branch: branchMatch?.[1]?.trim(),
      };
    })
    .filter((w) => w.path);
}

function isPathInside(parentPath, childPath) {
  const normalizedParent = normalizePathForMatch(parentPath);
  const normalizedChild = normalizePathForMatch(childPath);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`);
}

function getDisplayPath(targetPath, commonRepoRoot) {
  const normalizedTargetPath = normalizePathForCompare(targetPath);

  if (
    !isPathInside(commonRepoRoot, normalizedTargetPath) ||
    normalizedTargetPath === commonRepoRoot
  ) {
    return normalizedTargetPath;
  }

  return normalizedTargetPath.slice(commonRepoRoot.length + 1);
}

export function formatWorktreeDisplayPath(
  targetPath,
  commonRepoRoot = getCommonRepoRoot(getCommonGitDir(getCurrentWorktreePath()))
) {
  const displayPath = getDisplayPath(targetPath, commonRepoRoot);
  return path.isAbsolute(displayPath) ? displayPath : `./${displayPath}`;
}

function listVisibleEntries(dirPath) {
  return readdirSync(dirPath).filter((entry) => !IGNORABLE_DIRECTORY_ENTRIES.has(entry));
}

function removeIgnorableEntries(dirPath) {
  for (const entry of IGNORABLE_DIRECTORY_ENTRIES) {
    const entryPath = path.join(dirPath, entry);
    if (existsSync(entryPath)) {
      rmSync(entryPath, { force: true, recursive: false });
    }
  }
}

export function pruneEmptyManagedAncestors(removedPath, managedRoot) {
  let currentPath = normalizePathForCompare(path.dirname(removedPath));
  const normalizedManagedRoot = normalizePathForCompare(managedRoot);

  while (
    isPathInside(normalizedManagedRoot, currentPath) &&
    currentPath !== normalizedManagedRoot
  ) {
    if (!existsSync(currentPath)) {
      currentPath = normalizePathForCompare(path.dirname(currentPath));
      continue;
    }

    const visibleEntries = listVisibleEntries(currentPath);
    if (visibleEntries.length > 0) {
      return;
    }

    removeIgnorableEntries(currentPath);
    rmSync(currentPath, { recursive: true, force: true });
    currentPath = normalizePathForCompare(path.dirname(currentPath));
  }
}

function getManagedWorktreeGitPointer(dirPath) {
  const gitPath = path.join(dirPath, '.git');
  if (!existsSync(gitPath)) {
    return null;
  }

  try {
    const gitFile = readFileSync(gitPath, 'utf8').trim();
    const match = gitFile.match(/^gitdir:\s*(.+)$/);
    if (!match) {
      return null;
    }

    return normalizePathForCompare(path.resolve(dirPath, match[1].trim()));
  } catch {
    return null;
  }
}

function looksLikeManagedWorktreeRoot(dirPath, gitCommonDir) {
  const gitPointer = getManagedWorktreeGitPointer(dirPath);
  if (!gitPointer) {
    return false;
  }

  const expectedWorktreesGitDir = normalizePathForCompare(path.join(gitCommonDir, 'worktrees'));
  return isPathInside(expectedWorktreesGitDir, gitPointer);
}

function toBranchFromManagedWorktreePath(managedWorktreesRoot, dirPath) {
  let result = path.relative(managedWorktreesRoot, dirPath).replace(/\\/g, '/');
  let start = 0;
  let end = result.length;
  while (start < end && result[start] === '/') {
    start++;
  }
  while (end > start && result[end - 1] === '/') {
    end--;
  }
  return result.slice(start, end);
}

function findOrphanedManagedWorktreeDirs({
  managedWorktreesRoot,
  activeWorktreePaths = [],
  gitCommonDir,
}) {
  const normalizedManagedRoot = normalizePathForCompare(managedWorktreesRoot);
  if (!existsSync(normalizedManagedRoot)) {
    return [];
  }

  const activePathSet = new Set(
    activeWorktreePaths.map((worktreePath) => normalizePathForCompare(worktreePath))
  );
  const orphanedDirs = [];

  function visit(dirPath) {
    const normalizedDirPath = normalizePathForCompare(dirPath);

    if (activePathSet.has(normalizedDirPath)) {
      return;
    }

    if (looksLikeManagedWorktreeRoot(normalizedDirPath, gitCommonDir)) {
      orphanedDirs.push(normalizedDirPath);
      return;
    }

    for (const entry of readdirSync(normalizedDirPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      visit(path.join(normalizedDirPath, entry.name));
    }
  }

  visit(normalizedManagedRoot);
  return orphanedDirs;
}

function localBranchExists(branch) {
  return gitCommandSucceeds(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
}

export function removeOrphanedManagedWorktreeDirs({
  managedWorktreesRoot,
  activeWorktreePaths = [],
  gitCommonDir,
  branchExists = localBranchExists,
  removeDir = (dirPath) => rmSync(dirPath, { recursive: true, force: true }),
  pruneAncestors = pruneEmptyManagedAncestors,
  dryRun = false,
  log = console.log,
  commonRepoRoot = getCommonRepoRoot(getCommonGitDir(getCurrentWorktreePath())),
}) {
  const normalizedManagedRoot = normalizePathForCompare(managedWorktreesRoot);
  const orphanedDirs = findOrphanedManagedWorktreeDirs({
    managedWorktreesRoot: normalizedManagedRoot,
    activeWorktreePaths,
    gitCommonDir,
  });
  const summary = {
    removed: [],
    skippedExistingBranch: [],
  };

  orphanedDirs.forEach((dirPath) => {
    const branch = toBranchFromManagedWorktreePath(normalizedManagedRoot, dirPath);

    if (!branch || branch === '.') {
      return;
    }

    if (branchExists(branch)) {
      log(
        `Warning: orphaned directory still has a local branch: ${branch} → ${formatWorktreeDisplayPath(dirPath, commonRepoRoot)}`
      );
      summary.skippedExistingBranch.push({ branch, path: dirPath });
      return;
    }

    if (dryRun) {
      log(
        `[dry-run] Would remove orphaned worktree directory ${formatWorktreeDisplayPath(dirPath, commonRepoRoot)}`
      );
    } else {
      log(
        `Removing orphaned worktree directory ${formatWorktreeDisplayPath(dirPath, commonRepoRoot)}`
      );
      removeDir(dirPath);
      pruneAncestors(dirPath, normalizedManagedRoot);
    }

    summary.removed.push({ branch, path: dirPath });
  });

  return summary;
}

export function formatCleanupSummaryLine(label, worktrees) {
  if (worktrees.length === 0) {
    return `${label}: 0`;
  }

  const items = worktrees.map((worktree) => {
    if (worktree.branch) {
      return worktree.branch;
    }

    if (worktree.path) {
      return worktree.path;
    }

    return '<no-branch>';
  });
  const details = items.join(', ');
  return `${label}: ${worktrees.length} (${details})`;
}

function getSummaryActionLabel({ dryRun, action, previewAction }) {
  return dryRun ? previewAction : action;
}

export function removeMergedWorktrees({
  mergedWorktrees,
  currentWorktreePath,
  currentBranch,
  normalizePath = normalizePathForCompare,
  checkWorktreeClean = isWorktreeClean,
  gitRunner = runGit,
  pruneAncestors,
  dryRun = false,
  log = console.log,
  commonRepoRoot = getCommonRepoRoot(getCommonGitDir(getCurrentWorktreePath())),
  managedWorktreesRoot,
}) {
  const summary = {
    removed: [],
    skippedCurrent: [],
    skippedDirty: [],
    skippedRemovalFailed: [],
    skippedBranchDeleteFailed: [],
  };
  const normalizedCurrentWorktreePath = normalizePath(currentWorktreePath);

  mergedWorktrees.forEach((w) => {
    const isCurrentWorktree = normalizePath(w.path) === normalizedCurrentWorktreePath;
    const isCurrentBranch = w.branch === currentBranch;

    if (isCurrentWorktree || isCurrentBranch) {
      log(
        `Skipping current worktree/branch: ${w.branch} → ${formatWorktreeDisplayPath(w.path, commonRepoRoot)}`
      );
      summary.skippedCurrent.push(w);
      return;
    }

    if (!checkWorktreeClean(w.path)) {
      log(
        `Skipping dirty worktree/branch: ${w.branch} → ${formatWorktreeDisplayPath(w.path, commonRepoRoot)}`
      );
      summary.skippedDirty.push(w);
      return;
    }

    let removedWorktree = false;

    if (dryRun) {
      log(`[dry-run] Would remove worktree ${formatWorktreeDisplayPath(w.path, commonRepoRoot)}`);
      removedWorktree = true;
    } else {
      try {
        log(`Removing worktree ${formatWorktreeDisplayPath(w.path, commonRepoRoot)}`);
        gitRunner(['worktree', 'remove', '--', w.path], { stdio: 'inherit', exitOnError: false });
        removedWorktree = true;
      } catch {
        log(`Skipping worktree ${formatWorktreeDisplayPath(w.path, commonRepoRoot)}`);
        summary.skippedRemovalFailed.push(w);
      }
    }

    if (!removedWorktree) {
      return;
    }

    if (dryRun) {
      log(`[dry-run] Would delete branch ${w.branch}`);
      summary.removed.push(w);
      return;
    }

    pruneAncestors(w.path, managedWorktreesRoot);

    try {
      log(`Deleting branch ${w.branch}`);
      gitRunner(['branch', '-D', '--', w.branch], { stdio: 'inherit', exitOnError: false });
      summary.removed.push(w);
    } catch {
      log(`Skipping branch ${w.branch}`);
      summary.skippedBranchDeleteFailed.push(w);
    }
  });

  return summary;
}

export function removeMergedBranchesWithoutWorktrees({
  mergedBranches,
  activeWorktreeBranches,
  currentBranch,
  gitRunner = runGit,
  dryRun = false,
  log = console.log,
}) {
  const activeBranches = new Set(activeWorktreeBranches);
  const summary = {
    removed: [],
    skippedCurrent: [],
    skippedActiveWorktree: [],
    skippedDeleteFailed: [],
  };

  mergedBranches.forEach((branch) => {
    if (branch === currentBranch) {
      log(`Skipping current branch: ${branch}`);
      summary.skippedCurrent.push({ branch });
      return;
    }

    if (activeBranches.has(branch)) {
      summary.skippedActiveWorktree.push({ branch });
      return;
    }

    if (dryRun) {
      log(`[dry-run] Would delete merged branch without worktree ${branch}`);
      summary.removed.push({ branch });
      return;
    }

    try {
      log(`Deleting merged branch without worktree ${branch}`);
      gitRunner(['branch', '-D', '--', branch], { stdio: 'inherit', exitOnError: false });
      summary.removed.push({ branch });
    } catch {
      log(`Skipping branch ${branch}`);
      summary.skippedDeleteFailed.push({ branch });
    }
  });

  return summary;
}

export function isEntrypoint({ argv1 = process.argv[1], moduleUrl = import.meta.url } = {}) {
  if (!argv1) {
    return false;
  }

  return moduleUrl === pathToFileURL(path.resolve(argv1)).href;
}

export async function main({ auto = false, dryRun = false, cwd = process.cwd() } = {}) {
  const config = await loadDevxConfig({ cwd });
  const currentWorktreePath = getCurrentWorktreePath();
  const commonGitDir = getCommonGitDir(currentWorktreePath);
  const commonRepoRoot = getCommonRepoRoot(commonGitDir);
  const managedWorktreesRoot = normalizePathForCompare(config.worktreeRootAbsolute);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Repository cleanup');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (dryRun) {
    console.log(
      'Dry run mode enabled. No fetch, prune, branch deletion, or filesystem removal will occur.\n'
    );
  }

  const status = runGit(['status', '--porcelain']).trim();
  if (status) {
    console.error(
      'Working tree is dirty. Please commit, stash, or discard your changes before running dev-cleanup.'
    );
    process.exit(1);
  }

  const currentBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']).trim();

  console.log('→ Fetching latest refs from origin');
  if (dryRun) {
    console.log('[dry-run] Skipping fetch -- using current local refs');
  } else {
    runGit(['fetch', '--prune', 'origin'], { stdio: 'inherit' });
  }

  console.log('\n→ Pruning stale worktrees');
  if (dryRun) {
    console.log('[dry-run] Skipping worktree prune');
  } else {
    runGit(['worktree', 'prune'], { stdio: 'inherit' });
  }

  console.log('\n→ Active worktrees');
  runGit(['worktree', 'list'], { stdio: 'inherit' });

  const branchInfo = runGit(['branch', '-vv', '--no-color']);

  console.log('\n→ Local branches with missing remote\n');

  const goneBranches = branchInfo
    .split('\n')
    .filter((line) => line.includes(': gone]'))
    .map(
      (line) =>
        line
          .replace(/^[*+]\s*/, '')
          .trim()
          .split(/\s+/)[0]
    )
    .filter(Boolean);

  if (goneBranches.length === 0) {
    console.log('None');
  } else {
    goneBranches.forEach((b) => console.log(b));
  }

  console.log(`\n→ Branches already merged into origin/${config.baseBranch}\n`);

  const mergedBranches = runGit(['branch', '--merged', `origin/${config.baseBranch}`, '--no-color'])
    .split('\n')
    .map((b) => b.replace(/^[*+]\s*/, '').trim())
    .filter((b) => b && b !== config.baseBranch && !b.startsWith('('));

  if (mergedBranches.length === 0) {
    console.log('None');
  } else {
    mergedBranches.forEach((b) => console.log(b));
  }

  const worktreesOutput = runGit(['worktree', 'list', '--porcelain']);
  const worktrees = parseWorktrees(worktreesOutput);

  console.log('\n→ Worktrees whose branch is merged\n');

  const mergedWorktrees = worktrees.filter((w) => w.branch && mergedBranches.includes(w.branch));

  if (mergedWorktrees.length === 0) {
    console.log('None');
  } else {
    mergedWorktrees.forEach((w) => {
      console.log(`${w.branch} → ${w.path}`);
    });
  }

  console.log('\n→ Merged branches without an active worktree\n');

  const mergedBranchesWithoutWorktrees = mergedBranches.filter(
    (branch) => !worktrees.some((worktree) => worktree.branch === branch)
  );

  if (mergedBranchesWithoutWorktrees.length === 0) {
    console.log('None');
  } else {
    mergedBranchesWithoutWorktrees.forEach((branch) => {
      console.log(branch);
    });
  }

  if (auto && mergedWorktrees.length > 0) {
    console.log('\n→ Removing merged worktrees and branches\n');
    const removalSummary = removeMergedWorktrees({
      mergedWorktrees,
      currentWorktreePath,
      currentBranch,
      pruneAncestors: pruneEmptyManagedAncestors,
      dryRun,
      commonRepoRoot,
      managedWorktreesRoot,
    });

    const totalRemoved = removalSummary.removed.length;
    const totalSkipped =
      removalSummary.skippedCurrent.length +
      removalSummary.skippedDirty.length +
      removalSummary.skippedRemovalFailed.length +
      removalSummary.skippedBranchDeleteFailed.length;

    console.log('\n→ Cleanup summary\n');
    console.log(
      formatCleanupSummaryLine(
        getSummaryActionLabel({
          dryRun,
          action: 'Removed',
          previewAction: 'Would remove',
        }),
        removalSummary.removed
      )
    );
    console.log(`Total removed: ${totalRemoved}`);
    console.log(formatCleanupSummaryLine('Skipped current', removalSummary.skippedCurrent));
    console.log(formatCleanupSummaryLine('Skipped dirty', removalSummary.skippedDirty));
    console.log(
      formatCleanupSummaryLine('Skipped remove failed', removalSummary.skippedRemovalFailed)
    );
    console.log(
      formatCleanupSummaryLine(
        'Skipped branch delete failed',
        removalSummary.skippedBranchDeleteFailed
      )
    );
    console.log(`Total skipped: ${totalSkipped}`);
  }

  if (auto) {
    const mergedBranchSummary = removeMergedBranchesWithoutWorktrees({
      mergedBranches: mergedBranchesWithoutWorktrees,
      activeWorktreeBranches: worktrees.map((worktree) => worktree.branch),
      currentBranch,
      dryRun,
    });

    console.log('\n→ Merged branches without worktrees cleanup\n');
    console.log(
      formatCleanupSummaryLine(
        getSummaryActionLabel({
          dryRun,
          action: 'Removed merged branches',
          previewAction: 'Would delete merged branches',
        }),
        mergedBranchSummary.removed
      )
    );
    console.log(
      formatCleanupSummaryLine('Skipped current branch', mergedBranchSummary.skippedCurrent)
    );
    console.log(
      formatCleanupSummaryLine(
        'Skipped active worktree branch',
        mergedBranchSummary.skippedActiveWorktree
      )
    );
    console.log(
      formatCleanupSummaryLine(
        'Skipped merged branch delete failed',
        mergedBranchSummary.skippedDeleteFailed
      )
    );

    const orphanedSummary = removeOrphanedManagedWorktreeDirs({
      managedWorktreesRoot,
      activeWorktreePaths: worktrees.map((worktree) => worktree.path),
      gitCommonDir: commonGitDir,
      dryRun,
      commonRepoRoot,
    });

    console.log('\n→ Orphaned worktree directories\n');
    console.log(
      formatCleanupSummaryLine(
        getSummaryActionLabel({
          dryRun,
          action: 'Removed orphaned dirs',
          previewAction: 'Would remove orphaned dirs',
        }),
        orphanedSummary.removed
      )
    );
    console.log(
      formatCleanupSummaryLine(
        'Skipped orphaned dirs with local branch',
        orphanedSummary.skippedExistingBranch
      )
    );

    if (orphanedSummary.skippedExistingBranch.length > 0) {
      console.log(
        'Review skipped orphaned directories above. They still have local branches, which usually means Git metadata and the filesystem drifted out of sync.'
      );
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

if (isEntrypoint()) {
  await main({
    auto: process.argv.includes('--auto'),
    dryRun: process.argv.includes('--dry-run'),
  });
}
