import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function sanitize(value, maxLength = 63) {
  if (!value) return '';

  let result = '';
  let prevWasDash = false;

  const lower = value.toLowerCase();

  for (let i = 0; i < lower.length; i++) {
    const char = lower[i];

    const isValid = (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char === '-';

    if (isValid) {
      if (char === '-') {
        if (!prevWasDash) {
          result += '-';
          prevWasDash = true;
        }
      } else {
        result += char;
        prevWasDash = false;
      }
    } else if (!prevWasDash) {
      result += '-';
      prevWasDash = true;
    }
  }

  // trim leading/trailing dashes
  let start = 0;
  let end = result.length;

  while (start < end && result[start] === '-') start++;
  while (end > start && result[end - 1] === '-') end--;

  return result.slice(start, end).slice(0, maxLength);
}

export function detectWorktreeHint(repoPath) {
  const segments = repoPath.split(path.sep).filter(Boolean);
  const worktreesIndex = segments.lastIndexOf('worktrees');
  if (worktreesIndex >= 0 && segments[worktreesIndex + 1]) {
    return segments[worktreesIndex + 1];
  }

  return path.basename(repoPath);
}

export function computeOffset(repoPath, processEnv = process.env, maxPortOffset = 10000) {
  const explicitOffset = processEnv.WORKTREE_PORT_OFFSET;
  const maxExplicitOffset = maxPortOffset - 1;
  if (explicitOffset !== undefined) {
    const parsed = Number.parseInt(explicitOffset, 10);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= maxExplicitOffset) {
      return parsed;
    }

    throw new Error(
      `WORKTREE_PORT_OFFSET must be an integer between 0 and ${String(maxExplicitOffset)}`
    );
  }

  const hashHex = createHash('sha256').update(repoPath).digest('hex');
  return Number.parseInt(hashHex.slice(0, 8), 16) % maxPortOffset;
}

export function expandUserPath(value) {
  if (!value) {
    return value;
  }

  if (value === '~') {
    return os.homedir();
  }

  if (value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }

  return value;
}

export function ensureParentDirectories(filePaths, { mkdir = mkdirSync } = {}) {
  const uniqueDirectories = new Set(filePaths.map((filePath) => path.dirname(filePath)));
  for (const directoryPath of uniqueDirectories) {
    mkdir(directoryPath, { recursive: true });
  }
}

export function buildWorktreeRuntime({
  cwd = process.cwd(),
  processEnv = process.env,
  projectSlugPrefix,
  basePorts,
  worktreeHintMaxLength = 24,
  maxPortOffset = 10000,
}) {
  const worktreeHint = sanitize(detectWorktreeHint(cwd), worktreeHintMaxLength) || 'default';
  const portOffset = computeOffset(cwd, processEnv, maxPortOffset);
  const projectHash = createHash('sha256').update(cwd).digest('hex').slice(0, 6);
  const projectName =
    sanitize(`${projectSlugPrefix}-${worktreeHint}-${projectHash}`) ||
    `${projectSlugPrefix}-default`;
  const ports = Object.fromEntries(
    Object.entries(basePorts).map(([name, basePort]) => [name, basePort + portOffset])
  );

  return {
    cwd,
    worktreeHint,
    portOffset,
    projectHash,
    projectName,
    ports,
    maxPortOffset,
  };
}
