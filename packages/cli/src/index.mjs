#!/usr/bin/env node
import { runAuditAllCli } from './audit-all.mjs';
import { runInstallAllCli } from './deps-install.mjs';
import { main as runCleanupCli } from './dev-cleanup.mjs';
import { runEnvReconcileCli } from './env-reconcile.mjs';
import { runGithubSarifPullCli } from './github-sarif-pull.mjs';
import { runNcuAllCli } from './ncu-all.mjs';
import { runPrAgentCli } from './pr-agent.mjs';
import { runPrReviewCli } from './pr-summary.mjs';
import {
  runRepoBootstrapCli,
  runRepoSyncCli,
  runRepoSyncTemplatesCli,
} from './repo-sync-templates.mjs';
import { runReleaseVersionCli } from './release-version.mjs';
import { runTaskStartCli } from './task-start.mjs';
import { runWorktreeAdapterCommand } from './worktree-adapter.mjs';

function printHelp() {
  console.log('Usage: devx <task|worktree|env|deps|pr|github|release|repo> <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  devx task start <name>');
  console.log('  devx worktree cleanup [--auto] [--dry-run]');
  console.log('  devx worktree <adapter-command> [...]');
  console.log('  devx env reconcile');
  console.log('  devx deps install-all');
  console.log('  devx deps ci-all');
  console.log('  devx deps audit-all [--fix]');
  console.log('  devx deps ncu-all');
  console.log('  devx pr review');
  console.log('  devx pr agent <PR_NUMBER> [--copilot-only] [--include-coverage] [--debug]');
  console.log(
    '  devx github sarif pull [--repo owner/name] [--out-dir <path>] [--ref <ref>] [--category <value>] [--limit <n>] [--force] [--dry-run] [--debug]'
  );
  console.log('  devx release version [--dry-run]');
  console.log('  devx repo bootstrap [--dry-run] [--repo-root <path>] [--config <path>]');
  console.log('  devx repo sync [--dry-run] [--repo-root <path>] [--config <path>]');
  console.log('  devx repo sync-templates [--dry-run] [--repo-root <path>] [--config <path>]');
}

const argv = process.argv.slice(2);
const [group, command, ...rest] = argv;

if (!group || group === 'help' || group === '--help') {
  printHelp();
  process.exit(0);
}

if (group === 'task' && command === 'start') {
  await runTaskStartCli(rest[0]);
  process.exit(0);
}

if (group === 'worktree' && command === 'cleanup') {
  await runCleanupCli({
    auto: rest.includes('--auto'),
    dryRun: rest.includes('--dry-run'),
  });
  process.exit(0);
}

if (group === 'worktree' && command && command !== 'cleanup') {
  await runWorktreeAdapterCommand([command, ...rest]);
  process.exit(0);
}

if (group === 'env' && command === 'reconcile') {
  await runEnvReconcileCli();
  process.exit(0);
}

if (group === 'deps' && command === 'audit-all') {
  process.exit((await runAuditAllCli({ shouldFix: rest.includes('--fix') })).exitCode);
}

if (group === 'deps' && command === 'install-all') {
  process.exit((await runInstallAllCli({ mode: 'install' })).exitCode);
}

if (group === 'deps' && command === 'ci-all') {
  process.exit((await runInstallAllCli({ mode: 'ci' })).exitCode);
}

if (group === 'deps' && command === 'ncu-all') {
  await runNcuAllCli();
  process.exit(0);
}

if (group === 'pr' && command === 'review') {
  await runPrReviewCli();
  process.exit(0);
}

if (group === 'pr' && command === 'agent') {
  await runPrAgentCli({ argv: rest });
  process.exit(0);
}

if (group === 'github' && command === 'sarif' && rest[0] === 'pull') {
  await runGithubSarifPullCli({ argv: rest.slice(1) });
  process.exit(0);
}

if (group === 'release' && command === 'version') {
  await runReleaseVersionCli({ argv: rest });
  process.exit(0);
}

if (group === 'repo' && command === 'sync-templates') {
  await runRepoSyncTemplatesCli({ argv: rest });
  process.exit(0);
}

if (group === 'repo' && command === 'bootstrap') {
  await runRepoBootstrapCli({ argv: rest });
  process.exit(0);
}

if (group === 'repo' && command === 'sync') {
  await runRepoSyncCli({ argv: rest });
  process.exit(0);
}

printHelp();
process.exit(1);
