import { pathToFileURL } from 'node:url';

import { loadDevxConfig } from './config.mjs';

export async function loadWorktreeAdapterModule({ cwd = process.cwd(), config } = {}) {
  const resolvedConfig = config ?? (await loadDevxConfig({ cwd }));

  if (!resolvedConfig.worktree.adapterModuleAbsolute) {
    throw new Error('devx.config.mjs must define worktree.adapterModule for worktree commands');
  }

  const module = await import(pathToFileURL(resolvedConfig.worktree.adapterModuleAbsolute).href);

  return {
    config: resolvedConfig,
    module,
  };
}

export async function loadWorktreeAdapter({ cwd = process.cwd() } = {}) {
  const { config, module } = await loadWorktreeAdapterModule({ cwd });
  if (typeof module.runWorktreeDev !== 'function') {
    throw new Error(
      `${config.worktree.adapterModule} must export runWorktreeDev(argv, options?) for devx worktree commands`
    );
  }

  return {
    config,
    runWorktreeDev: module.runWorktreeDev,
  };
}

export async function runWorktreeAdapterCommand(commandArgs, options = {}) {
  const { cwd = process.cwd() } = options;
  const adapter = await loadWorktreeAdapter({ cwd });
  return adapter.runWorktreeDev(commandArgs, options);
}
