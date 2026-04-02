#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadDevxConfig } from './config.mjs';

const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

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

export async function runNcuAllCli({ cwd = process.cwd() } = {}) {
  const config = await loadDevxConfig({ cwd });
  const ncuCommand = path.resolve(
    config.repoRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'ncu.cmd' : 'ncu'
  );

  for (const project of config.packageDirPaths) {
    const packageFile = path.resolve(project.absolutePath, 'package.json');

    console.log(`\n==============================`);
    console.log(`📦 Updating ${project.name}`);
    console.log(`==============================`);

    try {
      run(
        ncuCommand,
        ['-i', '--packageFile', packageFile, '--format', 'group,repo'],
        config.repoRoot
      );
      run(NPM_COMMAND, ['--prefix', project.absolutePath, 'install'], config.repoRoot);
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
