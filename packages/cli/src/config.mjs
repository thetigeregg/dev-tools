import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function findConfigFile(startDir, configFileName = 'devx.config.mjs') {
  let currentDir = path.resolve(startDir);

  while (true) {
    const configPath = path.join(currentDir, configFileName);
    if (fs.existsSync(configPath)) {
      return configPath;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function resolveConfigPath(repoRoot, value) {
  if (!value) {
    return value;
  }

  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

export async function loadDevxConfig({
  cwd = process.cwd(),
  configFileName = 'devx.config.mjs',
} = {}) {
  const configPath = findConfigFile(cwd, configFileName);
  if (!configPath) {
    throw new Error(`Unable to find ${configFileName} from ${cwd}`);
  }

  const module = await import(pathToFileURL(configPath).href);
  const rawConfig = module.default ?? module.config;
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error(`${configPath} must export a default config object`);
  }

  const repoRoot = path.dirname(configPath);
  const defaultProjectName = path.basename(repoRoot);
  const config = {
    projectName: defaultProjectName,
    branchPrefix: 'feat/',
    baseBranch: 'main',
    worktreeRoot: 'worktrees',
    packageDirs: ['.'],
    env: {},
    pr: {},
    release: {},
    worktree: {},
    ...rawConfig,
  };

  config.repoRoot = repoRoot;
  config.configPath = configPath;
  config.worktreeRootAbsolute = resolveConfigPath(repoRoot, config.worktreeRoot);
  config.packageDirPaths = config.packageDirs.map((dirPath) => ({
    name: dirPath === '.' ? 'root' : dirPath,
    path: dirPath,
    absolutePath: resolveConfigPath(repoRoot, dirPath),
  }));

  if (config.worktree.adapterModule) {
    config.worktree.adapterModuleAbsolute = resolveConfigPath(
      repoRoot,
      config.worktree.adapterModule
    );
  }

  if (config.env.exampleFile) {
    config.env.exampleFileAbsolute = resolveConfigPath(repoRoot, config.env.exampleFile);
  }
  if (config.env.localFile) {
    config.env.localFileAbsolute = resolveConfigPath(repoRoot, config.env.localFile);
  }

  if (config.pr.summaryOutputFile) {
    config.pr.summaryOutputFileAbsolute = resolveConfigPath(repoRoot, config.pr.summaryOutputFile);
  }
  if (config.pr.agentOutputFile) {
    config.pr.agentOutputFileAbsolute = resolveConfigPath(repoRoot, config.pr.agentOutputFile);
  }

  if (config.release.packageJsonFile) {
    config.release.packageJsonFileAbsolute = resolveConfigPath(
      repoRoot,
      config.release.packageJsonFile
    );
  }
  if (config.release.changelogFile) {
    config.release.changelogFileAbsolute = resolveConfigPath(
      repoRoot,
      config.release.changelogFile
    );
  }

  return config;
}
