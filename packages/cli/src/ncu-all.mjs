#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { hasWorkspaceConfig } from './deps-install.mjs';
import { loadDevxConfig } from './config.mjs';

const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NCU_FORMAT = 'group,repo';

export function formatCommand(command, args) {
  return [command, ...args].join(' ');
}

export function getExitCode(error) {
  if (error && typeof error === 'object') {
    if ('status' in error && typeof error.status === 'number') {
      return error.status;
    }

    if ('code' in error && typeof error.code === 'number') {
      return error.code;
    }
  }

  return 1;
}

export function run(command, args, cwd) {
  const commandString = formatCommand(command, args);

  try {
    execFileSync(command, args, { cwd, stdio: 'inherit' });
  } catch (error) {
    if (error && typeof error === 'object') {
      error.commandString = commandString;
    }

    throw error;
  }
}

export function buildNcuArgs(packageFile) {
  return ['-i', '--packageFile', packageFile, '--format', NCU_FORMAT];
}

export function buildInstallArgs(projectAbsolutePath) {
  return ['--prefix', projectAbsolutePath, 'install'];
}

export function buildWorkspaceNcuArgs() {
  return ['-i', '--workspaces', '--format', NCU_FORMAT];
}

export function buildWorkspaceInstallArgs() {
  return ['install'];
}

export function runWorkspaceNcuStep({
  repoRoot,
  ncuCommand,
  npmCommand = NPM_COMMAND,
  spawn = spawnSync,
  log = console.log,
  errorLog = console.error,
}) {
  log(`\n==============================`);
  log(`📦 Updating workspaces`);
  log(`==============================`);

  const ncuArgs = buildWorkspaceNcuArgs();
  log(`Running: ${formatCommand(ncuCommand, ncuArgs)}`);
  const ncuResult = spawn(ncuCommand, ncuArgs, { cwd: repoRoot, stdio: 'inherit' });

  if (ncuResult.error) {
    errorLog(`❌ Failed in workspaces`);
    errorLog(ncuResult.error.message);
    return { name: 'workspaces', exitCode: 1 };
  }

  if (ncuResult.status !== 0) {
    errorLog(`❌ Failed in workspaces`);
    const exitCode = typeof ncuResult.status === 'number' ? ncuResult.status : 1;
    return { name: 'workspaces', exitCode };
  }

  const installArgs = buildWorkspaceInstallArgs();
  log(`Running: ${formatCommand(npmCommand, installArgs)}`);
  const installResult = spawn(npmCommand, installArgs, { cwd: repoRoot, stdio: 'inherit' });

  if (installResult.error) {
    errorLog(`❌ Failed in workspaces`);
    errorLog(installResult.error.message);
    return { name: 'workspaces', exitCode: 1 };
  }

  const exitCode = typeof installResult.status === 'number' ? installResult.status : 1;

  if (exitCode !== 0) {
    errorLog(`❌ Failed in workspaces`);
  }

  return { name: 'workspaces', exitCode };
}

export async function runNcuAllCli({ cwd = process.cwd() } = {}) {
  const config = await loadDevxConfig({ cwd });
  const ncuCommand = path.resolve(
    config.repoRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'ncu.cmd' : 'ncu'
  );

  if (hasWorkspaceConfig(config.repoRoot)) {
    const result = runWorkspaceNcuStep({ repoRoot: config.repoRoot, ncuCommand });

    if (result.exitCode !== 0) {
      process.exit(result.exitCode);
    }

    console.log('\n✅ All projects updated successfully');
    return;
  }

  for (const project of config.packageDirPaths) {
    const packageFile = path.resolve(project.absolutePath, 'package.json');

    console.log(`\n==============================`);
    console.log(`📦 Updating ${project.name}`);
    console.log(`==============================`);

    try {
      run(ncuCommand, buildNcuArgs(packageFile), config.repoRoot);
      run(NPM_COMMAND, buildInstallArgs(project.absolutePath), config.repoRoot);
    } catch (error) {
      const commandString =
        error &&
        typeof error === 'object' &&
        'commandString' in error &&
        typeof error.commandString === 'string'
          ? error.commandString
          : error && typeof error === 'object' && 'path' in error && typeof error.path === 'string'
            ? formatCommand(
                error.path,
                Array.isArray(error.spawnargs) ? error.spawnargs.slice(1) : []
              )
            : 'unknown command';
      const message = error instanceof Error ? error.message : String(error);

      console.error(`❌ Failed in ${project.name}`);
      console.error(`Command failed: ${commandString}`);
      console.error(message);
      process.exit(getExitCode(error));
    }
  }

  console.log('\n✅ All projects updated successfully');
}

export function isEntrypoint({ argv1 = process.argv[1], moduleUrl = import.meta.url } = {}) {
  if (!argv1) {
    return false;
  }

  return pathToFileURL(path.resolve(argv1)).href === moduleUrl;
}

if (isEntrypoint()) {
  await runNcuAllCli();
}
