import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function printHelp() {
  console.log('\nUsage: node tools/devx/worktree-adapter.mjs <bootstrap|help>\n');
}

function createCommandError(message, exitCode = 1) {
  const error = new Error(message);
  error.exitCode = exitCode;
  return error;
}

export function isEntrypoint({ argv1 = process.argv[1], moduleUrl = import.meta.url } = {}) {
  if (!argv1) {
    return false;
  }

  return pathToFileURL(path.resolve(argv1)).href === moduleUrl;
}

export async function bootstrapWorktree({ worktreePath, config } = {}) {
  const installScript = config?.worktree?.bootstrap?.installScript ?? 'deps:ci-all';
  console.log(`\nInstalling dependencies with npm run ${installScript}...\n`);
  execFileSync(getNpmCommand(), ['run', installScript], {
    stdio: 'inherit',
    cwd: worktreePath,
  });
}

async function loadDevxConfigForPath(worktreePath) {
  const configPath = path.resolve(worktreePath, 'devx.config.mjs');
  if (!existsSync(configPath)) {
    return undefined;
  }

  const configModule = await import(pathToFileURL(configPath).href);
  return configModule?.default;
}

export async function runWorktreeDev(argv = []) {
  const [command] = argv;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log('\nNo repo-specific devx worktree commands are configured.\n');
    return;
  }

  console.error(
    `Unknown worktree command: ${command}\nNo repo-specific devx worktree commands are configured.`
  );
  return;
}

if (isEntrypoint()) {
  const [command] = process.argv.slice(2);

  try {
    if (!command || command === 'help' || command === '--help' || command === '-h') {
      printHelp();
      process.exit(0);
    }

    if (command === 'bootstrap') {
      const worktreePath = process.cwd();
      const config = await loadDevxConfigForPath(worktreePath);
      await bootstrapWorktree({ worktreePath, config });
      process.exit(0);
    }

    printHelp();
    throw createCommandError(`Unknown adapter command: ${command}`, 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    const code = typeof error?.exitCode === 'number' ? error.exitCode : 1;
    process.exit(code);
  }
}
