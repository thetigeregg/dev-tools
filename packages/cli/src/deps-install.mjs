#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
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
  const projectPath = project.path === '.' ? '.' : project.absolutePath ?? project.path;
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
  process.exit((await runInstallAllCli({ mode: process.argv.includes('--ci') ? 'ci' : 'install' })).exitCode);
}
