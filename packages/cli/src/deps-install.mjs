#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadDevxConfig } from './config.mjs';

const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export function buildInstallArgs(projectPath, mode = 'install') {
  const installCommand = mode === 'ci' ? 'ci' : 'install';

  if (projectPath === '.') {
    return [installCommand];
  }

  return ['--prefix', projectPath, installCommand];
}

function hasWorkspaceConfig(repoRoot) {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const lockfilePath = path.join(repoRoot, 'package-lock.json');

  if (!fs.existsSync(packageJsonPath) || !fs.existsSync(lockfilePath)) {
    return false;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const workspaces = packageJson.workspaces;

    if (Array.isArray(workspaces) && workspaces.length > 0) {
      return true;
    }

    if (
      workspaces &&
      typeof workspaces === 'object' &&
      Array.isArray(workspaces.packages) &&
      workspaces.packages.length > 0
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function buildWorkspaceCiArgs() {
  return ['ci', '--workspaces', '--include-workspace-root'];
}

export function runWorkspaceCiStep({
  repoRoot,
  npmCommand = NPM_COMMAND,
  spawn = spawnSync,
  log = console.log,
  errorLog = console.error,
}) {
  const args = buildWorkspaceCiArgs();

  log(`\n==============================`);
  log(`📦 Installing workspace dependencies (ci)`);
  log(`==============================`);
  log(`Running: ${[npmCommand, ...args].join(' ')}`);

  const result = spawn(npmCommand, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    errorLog(`❌ workspace install failed to run`);
    errorLog(result.error.message);
    return { name: 'workspaces', exitCode: 1 };
  }

  const exitCode = typeof result.status === 'number' ? result.status : 1;

  if (exitCode === 0) {
    log(`✅ workspace ci completed`);
  } else {
    errorLog(`⚠️ workspace ci exited with code ${exitCode}`);
  }

  return { name: 'workspaces', exitCode };
}

export function runInstallStep(
  project,
  {
    repoRoot,
    npmCommand = NPM_COMMAND,
    mode = 'install',
    spawn = spawnSync,
    log = console.log,
    errorLog = console.error,
  }
) {
  const projectPath = project.path === '.' ? '.' : (project.absolutePath ?? project.path);
  const args = buildInstallArgs(projectPath, mode);

  log(`\n==============================`);
  log(`📦 ${mode === 'ci' ? 'Installing (ci)' : 'Installing'} ${project.name}`);
  log(`==============================`);
  log(`Running: ${[npmCommand, ...args].join(' ')}`);

  const result = spawn(npmCommand, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    errorLog(`❌ ${project.name} failed to run`);
    errorLog(result.error.message);
    return { name: project.name, exitCode: 1 };
  }

  const exitCode = typeof result.status === 'number' ? result.status : 1;

  if (exitCode === 0) {
    log(`✅ ${project.name} ${mode} completed`);
  } else {
    errorLog(`⚠️ ${project.name} ${mode} exited with code ${exitCode}`);
  }

  return { name: project.name, exitCode };
}

export function runInstallAll({
  projects,
  repoRoot,
  npmCommand = NPM_COMMAND,
  mode = 'install',
  spawn = spawnSync,
  log = console.log,
  errorLog = console.error,
} = {}) {
  if (mode === 'ci' && hasWorkspaceConfig(repoRoot)) {
    const result = runWorkspaceCiStep({
      repoRoot,
      npmCommand,
      spawn,
      log,
      errorLog,
    });

    if (result.exitCode === 0) {
      log(`\n✅ All ${mode} steps completed successfully`);
      return { failures: [], exitCode: 0 };
    }

    errorLog(`\n⚠️ ${mode} completed with remaining failures:`);
    errorLog(`- ${result.name} (exit code ${result.exitCode})`);
    return { failures: [result], exitCode: 1 };
  }

  const failures = [];

  for (const project of projects) {
    const result = runInstallStep(project, {
      repoRoot,
      npmCommand,
      mode,
      spawn,
      log,
      errorLog,
    });

    if (result.exitCode !== 0) {
      failures.push(result);
    }
  }

  if (failures.length === 0) {
    log(`\n✅ All ${mode} steps completed successfully`);
    return { failures, exitCode: 0 };
  }

  errorLog(`\n⚠️ ${mode} completed with remaining failures:`);
  for (const failure of failures) {
    errorLog(`- ${failure.name} (exit code ${failure.exitCode})`);
  }

  return { failures, exitCode: 1 };
}

export async function runInstallAllCli({ cwd = process.cwd(), mode = 'install' } = {}) {
  const config = await loadDevxConfig({ cwd });
  return runInstallAll({
    projects: config.packageDirPaths,
    repoRoot: config.repoRoot,
    mode,
  });
}

export function isEntrypoint({ argv1 = process.argv[1], moduleUrl = import.meta.url } = {}) {
  if (!argv1) {
    return false;
  }

  return pathToFileURL(path.resolve(argv1)).href === moduleUrl;
}

if (isEntrypoint()) {
  process.exit(
    (await runInstallAllCli({ mode: process.argv.includes('--ci') ? 'ci' : 'install' })).exitCode
  );
}
