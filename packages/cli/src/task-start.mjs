#!/usr/bin/env node
import { execSync, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadDevxConfig } from './config.mjs';
import { loadWorktreeAdapterModule } from './worktree-adapter.mjs';

const SAFE_BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/;

function runGit(args, options = {}) {
  return execFileSync('git', args, options);
}

function validateBranchName(branchName, label) {
  if (typeof branchName !== 'string' || branchName.length === 0) {
    console.error(
      `Invalid ${label}. Use only letters, numbers, ".", "_", "-", "/", and do not start with "-".`
    );
    process.exit(1);
  }

  if (!SAFE_BRANCH_PATTERN.test(branchName) || branchName.startsWith('-')) {
    console.error(
      `Invalid ${label}. Use only letters, numbers, ".", "_", "-", "/", and do not start with "-".`
    );
    process.exit(1);
  }

  const pathSegments = branchName.split('/');
  if (pathSegments.some((segment) => !segment || segment === '.' || segment === '..')) {
    console.error(`Invalid ${label}. Dot segments and empty path segments are not allowed.`);
    process.exit(1);
  }
}

function commandExists(command) {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getWorktreePathForBranch(branchName, { cwd }) {
  const output = runGit(['worktree', 'list', '--porcelain'], {
    encoding: 'utf8',
    cwd,
  });
  const normalizedOutput = output.replace(/\r\n/g, '\n');
  const targetRef = `refs/heads/${branchName}`;
  const blocks = normalizedOutput
    .trim()
    .split('\n\n')
    .map((block) => block.split('\n'));

  for (const block of blocks) {
    const worktreeLine = block.find((line) => line.startsWith('worktree '));
    const branchLine = block.find((line) => line.startsWith('branch '));
    if (!worktreeLine || !branchLine) {
      continue;
    }
    const worktreeDir = worktreeLine.slice('worktree '.length);
    const branchRef = branchLine.slice('branch '.length).trim();
    if (branchRef === targetRef) {
      return worktreeDir;
    }
  }

  return null;
}

export function isPathWithinParent(parentPath, targetPath) {
  const relativePath = path.relative(parentPath, targetPath);
  return (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

export function isEntrypoint({ argv1 = process.argv[1], moduleUrl = import.meta.url } = {}) {
  if (!argv1) {
    return false;
  }

  return pathToFileURL(path.resolve(argv1)).href === moduleUrl;
}

export async function runWorktreeBootstrap({ config, worktreePath, branch }) {
  if (!config.worktree.adapterModuleAbsolute) {
    console.log(
      '\nNo worktree bootstrap adapter configured. Skipping project-specific bootstrap.\n'
    );
    return;
  }

  const { module } = await loadWorktreeAdapterModule({ config });

  if (typeof module.bootstrapWorktree === 'function') {
    await module.bootstrapWorktree({
      branch,
      config,
      cwd: worktreePath,
      worktreePath,
    });
    return;
  }

  const adapterPath = path
    .relative(worktreePath, config.worktree.adapterModuleAbsolute)
    .replace(/\\/g, '/');

  execFileSync(process.execPath, [adapterPath, 'bootstrap'], {
    stdio: 'inherit',
    cwd: worktreePath,
  });
}

export async function runTaskStartCli(name, { cwd = process.cwd() } = {}) {
  const config = await loadDevxConfig({ cwd });

  if (!name) {
    console.error('Usage: devx task start <task-name>');
    process.exit(1);
  }

  validateBranchName(name, 'task name');
  validateBranchName(config.baseBranch, 'base branch config');

  const branch = name.includes('/') ? name : `${config.branchPrefix}${name}`;
  const worktreePath = path.join(config.worktreeRootAbsolute, branch);

  if (!isPathWithinParent(config.worktreeRootAbsolute, worktreePath)) {
    console.error(
      'Invalid task name. Worktree path must stay within the configured worktrees directory.'
    );
    process.exit(1);
  }

  const worktreeParentDir = path.dirname(worktreePath);
  if (worktreeParentDir) {
    mkdirSync(worktreeParentDir, { recursive: true });
  }

  try {
    const statusOutput = runGit(['status', '--porcelain'], {
      encoding: 'utf8',
      cwd: config.repoRoot,
    }).trim();
    if (statusOutput) {
      console.error('\nWorking directory has uncommitted changes.');
      console.error('Commit or stash before starting a new task.\n');
      process.exit(1);
    }

    console.log(`\nFetching latest origin/${config.baseBranch}...\n`);
    runGit(['fetch', 'origin', config.baseBranch, '--prune'], {
      stdio: 'inherit',
      cwd: config.repoRoot,
    });

    const hasLocalBaseBranch = (() => {
      try {
        runGit(['show-ref', '--verify', '--quiet', `refs/heads/${config.baseBranch}`], {
          stdio: 'ignore',
          cwd: config.repoRoot,
        });
        return true;
      } catch {
        return false;
      }
    })();

    if (!hasLocalBaseBranch) {
      console.log(`\nCreating local ${config.baseBranch} from origin/${config.baseBranch}...\n`);
      runGit(['branch', config.baseBranch, `origin/${config.baseBranch}`], {
        stdio: 'inherit',
        cwd: config.repoRoot,
      });
    } else {
      console.log(
        `\nFast-forwarding local ${config.baseBranch} to origin/${config.baseBranch}...\n`
      );
      try {
        runGit(['merge-base', '--is-ancestor', config.baseBranch, `origin/${config.baseBranch}`], {
          stdio: 'ignore',
          cwd: config.repoRoot,
        });
      } catch {
        console.error(
          `\nLocal ${config.baseBranch} has diverged from origin/${config.baseBranch}.`
        );
        console.error(
          `Reconcile your local ${config.baseBranch} with origin/${config.baseBranch} before starting a new task.`
        );
        console.error(
          `For example, to discard local divergence you can run: git branch -f ${config.baseBranch} origin/${config.baseBranch}\n`
        );
        process.exit(1);
      }

      const mainWorktreePath = getWorktreePathForBranch(config.baseBranch, {
        cwd: config.repoRoot,
      });
      if (mainWorktreePath) {
        try {
          const mainWorktreeStatus = runGit(['status', '--porcelain'], {
            cwd: mainWorktreePath,
            encoding: 'utf8',
          }).trim();

          if (mainWorktreeStatus) {
            console.error(
              `\nCannot fast-forward local ${config.baseBranch} because its worktree has uncommitted changes.`
            );
            console.error(
              `Clean or stash changes in the ${config.baseBranch} worktree before starting a new task.`
            );
            console.error(`${config.baseBranch} worktree path: ${mainWorktreePath}\n`);
            process.exit(1);
          }
        } catch (statusError) {
          console.error(`\nFailed to check status of local ${config.baseBranch} worktree.`);
          console.error(
            `Verify that the worktree at ${mainWorktreePath} is accessible and try again.\n`
          );
          const code = typeof statusError.status === 'number' ? statusError.status : 1;
          process.exit(code);
        }

        runGit(['merge', '--ff-only', `origin/${config.baseBranch}`], {
          stdio: 'inherit',
          cwd: mainWorktreePath,
        });
      } else {
        runGit(['branch', '-f', config.baseBranch, `origin/${config.baseBranch}`], {
          stdio: 'inherit',
          cwd: config.repoRoot,
        });
      }
    }

    console.log(`\nCreating worktree for branch: ${branch}\n`);
    runGit(['worktree', 'add', worktreePath, '-b', branch, config.baseBranch], {
      stdio: 'inherit',
      cwd: config.repoRoot,
    });

    console.log('\nBootstrapping worktree environment...\n');

    try {
      await runWorktreeBootstrap({ config, worktreePath, branch });
    } catch (error) {
      console.error('\nBootstrap script failed.');
      if (config.worktree.adapterModule) {
        console.error(
          `Run "node ${config.worktree.adapterModule} bootstrap" inside ${worktreePath} and retry.\n`
        );
      } else {
        console.error(
          'Add worktree.adapterModule to devx.config.mjs to enable project bootstrap hooks.\n'
        );
      }
      const code = typeof error.status === 'number' ? error.status : 1;
      process.exit(code);
    }

    if (process.platform === 'darwin' && commandExists('code')) {
      console.log('\nOpening VS Code...\n');
      try {
        execFileSync('code', [worktreePath], { stdio: 'inherit' });
      } catch {
        console.warn('\nCould not open VS Code automatically.\n');
        console.warn(`Open the worktree manually: ${worktreePath}\n`);
      }
    } else {
      console.log(`\nOpen the worktree in your editor: ${worktreePath}\n`);
    }

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Task started successfully

Branch:
  ${branch}

Worktree:
  ${worktreePath}

Next steps:

  cd ${worktreePath}
`);
  } catch (error) {
    console.error('Failed to set up worktree for task:', branch);
    if (error instanceof Error && error.message) {
      console.error(error.message);
    }
    const code = typeof error?.status === 'number' ? error.status : 1;
    process.exit(code);
  }
}

if (isEntrypoint()) {
  await runTaskStartCli(process.argv[2]);
}
