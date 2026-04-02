#!/usr/bin/env node
import { runAuditAllCli } from './audit-all.mjs';
import { main as runCleanupCli } from './dev-cleanup.mjs';
import { runEnvReconcileCli } from './env-reconcile.mjs';
import { runNcuAllCli } from './ncu-all.mjs';
import { runTaskStartCli } from './task-start.mjs';
import { runWorktreeAdapterCommand } from './worktree-adapter.mjs';

function printHelp() {
  console.log('Usage: devx <task|worktree|env|deps> <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  devx task start <name>');
  console.log('  devx worktree info');
  console.log('  devx worktree bootstrap [--force]');
  console.log('  devx worktree cleanup [--auto] [--dry-run]');
  console.log('  devx env reconcile');
  console.log('  devx deps audit-all [--fix]');
  console.log('  devx deps ncu-all');
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

if (group === 'deps' && command === 'ncu-all') {
  await runNcuAllCli();
  process.exit(0);
}

printHelp();
process.exit(1);
