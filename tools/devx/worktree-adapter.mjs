import { execFileSync } from 'node:child_process';

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export async function bootstrapWorktree({ worktreePath }) {
  console.log('\nInstalling dependencies with npm ci...\n');
  execFileSync(getNpmCommand(), ['ci'], {
    stdio: 'inherit',
    cwd: worktreePath,
  });
}

export async function runWorktreeDev(argv = []) {
  const [command] = argv;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log('\nNo repo-specific devx worktree commands are configured.\n');
    return;
  }

  console.error(`Unknown worktree command: ${command}`);
  console.error('No repo-specific devx worktree commands are configured.');
  process.exit(1);
}
