import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { loadDevxConfig } from './config.mjs';
import { buildWorktreeRuntime, expandUserPath } from './worktree-runtime.mjs';

function shellEscape(value, platform = process.platform) {
  if (platform === 'win32') {
    return `"${String(value).replace(/"/g, '""')}"`;
  }

  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

export function resolveShellInvocation(command, platform = process.platform) {
  if (platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', command],
    };
  }

  return {
    command: 'sh',
    args: ['-lc', command],
  };
}

function configState(value) {
  return value ? '[configured]' : '(not set)';
}

export class WorktreeCommandError extends Error {
  constructor(message, { command, args = [], status = 1, stdout = '', stderr = '' } = {}) {
    super(message);
    this.name = 'WorktreeCommandError';
    this.command = command;
    this.args = args;
    this.status = status;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export function packageHasDependencies(packageDir) {
  const packageJsonPath = path.resolve(packageDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const dependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies'];

    return dependencyFields.some((fieldName) => {
      const value = packageJson[fieldName];
      return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
    });
  } catch {
    return true;
  }
}

export function buildComposeArgs(config) {
  const composeFiles = config.worktree.compose?.files ?? ['docker-compose.yml'];
  return ['compose', ...composeFiles.flatMap((filePath) => ['-f', filePath])];
}

export function resolveWorktreePorts(config) {
  const runtimeConfig = config.worktree.runtime ?? {};

  return buildWorktreeRuntime({
    cwd: config.repoRoot,
    processEnv: process.env,
    projectSlugPrefix: runtimeConfig.projectSlugPrefix ?? config.projectName,
    worktreeHintMaxLength: runtimeConfig.worktreeHintMaxLength ?? 24,
    maxPortOffset: runtimeConfig.maxPortOffset ?? 10000,
    basePorts: runtimeConfig.ports ?? {},
  });
}

function resolveConfigFilePath(repoRoot, filePath) {
  const expandedPath = expandUserPath(filePath);
  if (!expandedPath) {
    return undefined;
  }

  return path.isAbsolute(expandedPath) ? expandedPath : path.resolve(repoRoot, expandedPath);
}

export async function createWorktreeContext({
  cwd = process.cwd(),
  processEnv = process.env,
  config,
  platform = process.platform,
} = {}) {
  const resolvedConfig = config ?? (await loadDevxConfig({ cwd }));
  const worktreeConfig = resolvedConfig.worktree ?? {};
  const runtimeConfig = worktreeConfig.runtime ?? {};
  const envConfig = worktreeConfig.env ?? {};
  const composeConfig = worktreeConfig.compose ?? {};
  const frontendConfig = worktreeConfig.frontend ?? {};
  const pwaConfig = worktreeConfig.pwa ?? {};
  const dbConfig = worktreeConfig.db ?? {};

  const runtime = buildWorktreeRuntime({
    cwd: resolvedConfig.repoRoot,
    processEnv,
    projectSlugPrefix: runtimeConfig.projectSlugPrefix ?? resolvedConfig.projectName,
    worktreeHintMaxLength: runtimeConfig.worktreeHintMaxLength ?? 24,
    maxPortOffset: runtimeConfig.maxPortOffset ?? 10000,
    basePorts: runtimeConfig.ports ?? {},
  });

  const defaultSharedSecretsDir =
    expandUserPath(envConfig.defaultSharedSecretsDir) ??
    path.join(os.homedir(), '.config', resolvedConfig.projectName, 'nas-secrets');
  const explicitSecretsHostDir = expandUserPath(
    envConfig.secretsHostDir ?? (processEnv.SECRETS_HOST_DIR && processEnv.SECRETS_HOST_DIR.trim())
  );
  const secretsHostDir =
    explicitSecretsHostDir || (existsSync(defaultSharedSecretsDir) ? defaultSharedSecretsDir : '');

  const localEnvPath =
    resolvedConfig.env?.localFileAbsolute ??
    path.resolve(resolvedConfig.repoRoot, envConfig.localFile ?? '.env');
  const sharedEnvFromOverrides =
    resolveConfigFilePath(
      resolvedConfig.repoRoot,
      processEnv.WORKTREE_ENV_FILE && processEnv.WORKTREE_ENV_FILE.trim()
    ) || resolveConfigFilePath(resolvedConfig.repoRoot, envConfig.sharedTemplateFile);
  const sharedEnvFromResolvedConfig = resolveConfigFilePath(
    resolvedConfig.repoRoot,
    resolvedConfig.env?.sharedTemplateFile
  );
  const sharedEnvFilePath = sharedEnvFromOverrides || sharedEnvFromResolvedConfig;

  const certDir = path.resolve(resolvedConfig.repoRoot, pwaConfig.certDir ?? '.tmp/pwa-certs');
  const certFileEnvVar = pwaConfig.certFileEnvVar ?? 'WORKTREE_PWA_CERT_FILE';
  const keyFileEnvVar = pwaConfig.keyFileEnvVar ?? 'WORKTREE_PWA_KEY_FILE';
  const simulatorCertFile =
    expandUserPath(processEnv[certFileEnvVar] && processEnv[certFileEnvVar].trim()) ||
    path.join(certDir, 'localhost.pem');
  const simulatorKeyFile =
    expandUserPath(processEnv[keyFileEnvVar] && processEnv[keyFileEnvVar].trim()) ||
    path.join(certDir, 'localhost-key.pem');

  const manualsPublicBaseUrl =
    pwaConfig.manualsPublicBaseUrl ??
    (runtime.ports.EDGE_HOST_PORT
      ? `http://127.0.0.1:${runtime.ports.EDGE_HOST_PORT}/manuals`
      : '');
  const pwaManualsPublicBaseUrl = pwaConfig.pwaManualsPublicBaseUrl ?? '/manuals';
  const buildRoot = path.resolve(
    resolvedConfig.repoRoot,
    frontendConfig.buildRoot ?? pwaConfig.buildRoot ?? 'www/browser'
  );
  const composeArgs = buildComposeArgs(resolvedConfig);

  function resolveSecretsHostDir(inputEnv) {
    const configuredSecretsHostDir = expandUserPath(
      inputEnv.SECRETS_HOST_DIR && inputEnv.SECRETS_HOST_DIR.trim()
    );

    return configuredSecretsHostDir || secretsHostDir;
  }

  function createSharedEnv({
    processEnv: inputEnv = processEnv,
    manualsPublicBaseUrl: manualsUrl = manualsPublicBaseUrl,
  } = {}) {
    const resolvedSecretsHostDir = resolveSecretsHostDir(inputEnv);
    const frontendPort = runtime.ports.FRONTEND_PORT;
    const edgePort = runtime.ports.EDGE_HOST_PORT;
    const corsOrigin =
      frontendPort && edgePort
        ? [
            `http://127.0.0.1:${frontendPort}`,
            `http://localhost:${frontendPort}`,
            `http://127.0.0.1:${edgePort}`,
            `http://localhost:${edgePort}`,
          ].join(',')
        : '';

    return {
      ...inputEnv,
      ...(resolvedSecretsHostDir ? { SECRETS_HOST_DIR: resolvedSecretsHostDir } : {}),
      [composeConfig.projectNameEnvVar ?? 'COMPOSE_PROJECT_NAME']: runtime.projectName,
      ...runtime.ports,
      ...(corsOrigin ? { CORS_ORIGIN: corsOrigin } : {}),
      ...(manualsUrl ? { MANUALS_PUBLIC_BASE_URL: manualsUrl } : {}),
    };
  }

  function createPwaStackEnv(baseEnv = createSharedEnv()) {
    return {
      ...baseEnv,
      MANUALS_PUBLIC_BASE_URL: pwaManualsPublicBaseUrl,
    };
  }

  function run(command, commandArgs, env = createSharedEnv()) {
    const result = spawnSync(command, commandArgs, {
      cwd: resolvedConfig.repoRoot,
      env,
      stdio: 'inherit',
    });
    if (result.error) {
      throw result.error;
    }
    if (typeof result.status === 'number' && result.status !== 0) {
      throw new WorktreeCommandError(`${command} exited with code ${String(result.status)}`, {
        command,
        args: commandArgs,
        status: result.status,
      });
    }
  }

  function runCapture(command, commandArgs, env = createSharedEnv()) {
    const result = spawnSync(command, commandArgs, {
      cwd: resolvedConfig.repoRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });

    if (result.error) {
      throw result.error;
    }

    if (typeof result.status === 'number' && result.status !== 0) {
      if (result.stdout) {
        process.stdout.write(result.stdout);
      }
      if (result.stderr) {
        process.stderr.write(result.stderr);
      }
      throw new WorktreeCommandError(`${command} exited with code ${String(result.status)}`, {
        command,
        args: commandArgs,
        status: result.status,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      });
    }

    return result.stdout ?? '';
  }

  function runShell(command, env = createSharedEnv()) {
    const shell = resolveShellInvocation(command, platform);
    run(shell.command, shell.args, env);
  }

  function hasBash() {
    if (platform === 'win32') {
      return false;
    }

    const result = spawnSync('bash', ['-lc', 'true'], {
      cwd: resolvedConfig.repoRoot,
      env: createSharedEnv(),
      stdio: 'ignore',
    });
    return !result.error && result.status === 0;
  }

  function runNvmAwareShell(command, fallbackCommand, env = createSharedEnv()) {
    if (hasBash()) {
      run('bash', ['-lc', command], env);
      return;
    }

    console.log('Warning: bash is unavailable; falling back to sh for dependency install.');
    runShell(fallbackCommand, env);
  }

  function runShellCapture(command, env = createSharedEnv()) {
    const shell = resolveShellInvocation(command, platform);
    return runCapture(shell.command, shell.args, env);
  }

  function defaultSeedPath() {
    const envVarName = dbConfig.seedPathEnvVar ?? 'DEV_DB_SEED_PATH';
    const base =
      expandUserPath(processEnv[envVarName]) ||
      expandUserPath(dbConfig.defaultSeedPath) ||
      path.join(os.homedir(), '.cache', resolvedConfig.projectName, 'dev-db-seed', 'latest.sql.gz');
    return path.resolve(base);
  }

  return {
    cwd: resolvedConfig.repoRoot,
    platform,
    args: process.argv.slice(2),
    config: resolvedConfig,
    runtime,
    composeArgs,
    localEnvPath,
    sharedEnvFilePath,
    defaultSharedSecretsDir,
    secretsHostDir,
    simulatorCertFile,
    simulatorKeyFile,
    manualsPublicBaseUrl,
    pwaManualsPublicBaseUrl,
    buildRoot,
    createSharedEnv,
    createPwaStackEnv,
    run,
    runCapture,
    runShell,
    runShellCapture,
    runNvmAwareShell,
    defaultSeedPath,
  };
}

export function ensureLocalEnvFromSharedTemplate(context, force = false) {
  const hadLocalEnv = existsSync(context.localEnvPath);
  if (!force && hadLocalEnv) {
    return;
  }

  if (!context.sharedEnvFilePath) {
    if (force) {
      const message =
        'Shared env template path is not configured in the worktree context; cannot bootstrap .env.';
      console.error(message);
      throw new Error(message);
    }
    return;
  }

  if (!existsSync(context.sharedEnvFilePath)) {
    if (force) {
      const message = `Shared env template not found at "${context.sharedEnvFilePath}".`;
      console.error(message);
      throw new Error(message);
    }
    return;
  }

  mkdirSync(path.dirname(context.localEnvPath), { recursive: true });
  copyFileSync(context.sharedEnvFilePath, context.localEnvPath);
  console.log(
    hadLocalEnv ? 'Replaced .env from shared template' : 'Bootstrapped .env from shared template'
  );
}

export function listMissingDependencyDirs(context) {
  return context.config.packageDirPaths
    .filter((pkg) => pkg.path === '.' || packageHasDependencies(pkg.absolutePath))
    .map((pkg) => path.resolve(pkg.absolutePath, 'node_modules'))
    .filter((moduleDir) => !existsSync(moduleDir));
}

export function buildNvmAwareInstallCommand(installScript = 'i:all') {
  return [
    'if [ -f .nvmrc ]',
    'then',
    '  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"',
    '  if [ -s "$NVM_DIR/nvm.sh" ]',
    '  then',
    '    . "$NVM_DIR/nvm.sh"',
    '    nvm use',
    '  else',
    '    echo "Warning: .nvmrc found but nvm.sh was not found; continuing with current Node."',
    '  fi',
    'fi',
    `npm run ${installScript}`,
  ].join('\n');
}

export function ensureDependenciesInstalled(context, forceInstall = false) {
  const missing = listMissingDependencyDirs(context);

  if (!forceInstall && missing.length === 0) {
    return;
  }

  if (missing.length > 0) {
    console.log('Missing dependency directories detected:');
    for (const moduleDir of missing) {
      console.log(`  - ${moduleDir}`);
    }
  }

  const installScript = context.config.worktree.bootstrap?.installScript ?? 'deps:ci-all';
  console.log(`Installing workspace dependencies via: npm run ${installScript}`);
  context.runNvmAwareShell(
    buildNvmAwareInstallCommand(installScript),
    `npm run ${installScript}`,
    context.createSharedEnv()
  );
}

function listExternalIpv4Addresses() {
  const interfaces = os.networkInterfaces();
  const hosts = [];

  for (const entries of Object.values(interfaces)) {
    if (!entries) {
      continue;
    }

    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        hosts.push(entry.address);
      }
    }
  }

  return [...new Set(hosts)];
}

function getMkcertStatus(context) {
  const result = spawnSync('mkcert', ['-CAROOT'], {
    cwd: context.cwd,
    env: context.createSharedEnv(),
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  });

  if (result.error) {
    return {
      available: false,
      caroot: '',
    };
  }

  return {
    available: result.status === 0,
    caroot: result.status === 0 ? (result.stdout ?? '').trim() : '',
  };
}

function isReadableFile(filePath) {
  if (!filePath) {
    return false;
  }

  try {
    const fileStat = statSync(filePath);
    if (!fileStat.isFile()) {
      return false;
    }

    readFileSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function getSimulatorCertificateStatus(context) {
  const mkcertStatus = getMkcertStatus(context);
  const mkcertCaroot = mkcertStatus.caroot;
  const rootCaPath = mkcertCaroot ? path.join(mkcertCaroot, 'rootCA.pem') : '';

  return {
    mkcertAvailable: mkcertStatus.available,
    mkcertCaroot,
    rootCaPath,
    hasRootCa: isReadableFile(rootCaPath),
    certPath: context.simulatorCertFile,
    keyPath: context.simulatorKeyFile,
    isConfigured:
      isReadableFile(context.simulatorCertFile) && isReadableFile(context.simulatorKeyFile),
  };
}

export function printWorktreeInfo(context) {
  const certStatus = getSimulatorCertificateStatus(context);
  console.log(`Worktree path: ${context.cwd}`);
  console.log(`Compose project: ${context.runtime.projectName}`);
  console.log(`Port offset: ${context.runtime.portOffset}`);
  console.log('Ports:');

  for (const [name, port] of Object.entries(context.runtime.ports)) {
    console.log(
      `  ${name
        .toLowerCase()
        .replace(/_host_port$/, '')
        .replace(/_port$/, '')}: ${port}`
    );
  }

  if (context.runtime.ports.FRONTEND_PORT) {
    console.log('Simulator URLs:');
    console.log(`  quick browser: http://localhost:${context.runtime.ports.FRONTEND_PORT}`);
  }
  if (context.runtime.ports.PWA_HOST_PORT) {
    console.log(`  installed PWA: https://localhost:${context.runtime.ports.PWA_HOST_PORT}`);
  }
  if (context.runtime.ports.PWA_ROOT_CA_PORT) {
    console.log(
      `  root ca file:  http://localhost:${context.runtime.ports.PWA_ROOT_CA_PORT}/rootCA.pem`
    );
  }

  if (listExternalIpv4Addresses().length > 0) {
    console.log(
      '  network hosts: (external HTTPS URLs are not printed by default; mkcert SANs only cover localhost)'
    );
  }

  console.log(
    `PWA certs: ${certStatus.isConfigured ? '[configured]' : '[missing]'} (${context.simulatorCertFile}, ${context.simulatorKeyFile})`
  );
  console.log(
    `mkcert root CA: ${
      certStatus.hasRootCa
        ? '[configured]'
        : certStatus.mkcertAvailable
          ? '[missing]'
          : '[mkcert unavailable]'
    }${certStatus.rootCaPath ? ` (${certStatus.rootCaPath})` : ''}`
  );

  if (context.secretsHostDir) {
    console.log(`Secrets dir: ${configState(context.secretsHostDir)}`);
  } else {
    console.log('Secrets dir: ./nas-secrets (worktree-local default)');
  }

  if (existsSync(context.localEnvPath)) {
    console.log('Env file: [present]');
  } else if (context.sharedEnvFilePath && existsSync(context.sharedEnvFilePath)) {
    console.log('Env file: [missing; shared template configured]');
  } else {
    console.log('Env file: [missing; shared template not configured]');
  }

  console.log(`DB seed file: ${configState(context.defaultSeedPath())}`);
}

export function createFrontendProxyConfig(context) {
  const tempDir = path.resolve(context.cwd, '.tmp');
  mkdirSync(tempDir, { recursive: true });

  const proxyPath = path.join(tempDir, `proxy.worktree.${context.runtime.worktreeHint}.json`);
  const proxyConfig = {};
  const proxyRoutes = context.config.worktree.frontend?.proxyRoutes ?? {};

  for (const [route, targetPortKey] of Object.entries(proxyRoutes)) {
    const port = context.runtime.ports[targetPortKey];
    if (!port) {
      continue;
    }

    proxyConfig[route] = {
      target: `http://127.0.0.1:${port}`,
      secure: false,
      changeOrigin: true,
      logLevel: 'warn',
    };
  }

  writeFileSync(proxyPath, `${JSON.stringify(proxyConfig, null, 2)}\n`, 'utf8');
  return proxyPath;
}

export function resolveFrontendServeConfiguration(context) {
  const localEnvironmentPath = path.resolve(
    context.cwd,
    context.config.worktree.frontend?.localEnvironmentFile ??
      'src/environments/environment.local.ts'
  );

  if (existsSync(localEnvironmentPath)) {
    console.log(`Using local configuration (${path.relative(context.cwd, localEnvironmentPath)})`);
    return 'local';
  }

  console.log('Using development configuration');
  return 'development';
}

export function runFrontendDev(context, options = {}) {
  const proxyPath = createFrontendProxyConfig(context);
  const frontendConfig = context.config.worktree.frontend ?? {};
  const host =
    options.host ??
    (options.external
      ? (frontendConfig.externalHost ?? '0.0.0.0')
      : (frontendConfig.defaultHost ?? '127.0.0.1'));

  if (frontendConfig.prestartCommand) {
    context.runShell(frontendConfig.prestartCommand, context.createSharedEnv());
  }

  const serveCommand = frontendConfig.serveCommand ?? 'npx ng serve';
  const serveArgs = [
    '--port',
    String(context.runtime.ports.FRONTEND_PORT),
    '--host',
    host,
    '--proxy-config',
    proxyPath,
    '--configuration',
    resolveFrontendServeConfiguration(context),
  ];

  if (options.external) {
    if (host === '0.0.0.0' || host === '::') {
      console.log('Simulator browser mode: dev server is available on all interfaces.');
    } else {
      console.log(`Simulator browser mode: dev server is bound to ${host}.`);
    }
    console.log(
      `Open Safari in iPhone Simulator at http://localhost:${String(context.runtime.ports.FRONTEND_PORT)}`
    );
  }

  context.runShell(
    `${serveCommand} ${serveArgs.map((arg) => shellEscape(arg, context.platform)).join(' ')}`,
    context.createSharedEnv()
  );
}

export function buildPwa(context) {
  const pwaConfig = context.config.worktree.pwa ?? {};
  if (pwaConfig.prebuildCommand) {
    context.runShell(pwaConfig.prebuildCommand, context.createSharedEnv());
  }
  context.runShell(
    pwaConfig.buildCommand ?? 'npx ng build --configuration production',
    context.createSharedEnv()
  );
}

export function listBuildOutputEntries(buildRoot) {
  if (!existsSync(buildRoot)) {
    return [];
  }

  return readdirSync(buildRoot).sort();
}

export async function isPortReachable(port, host = '127.0.0.1') {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.unref();

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.setTimeout(750, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export function printMissingCertificateInstructions(context, logger = console) {
  const certStatus = getSimulatorCertificateStatus(context);

  if (!certStatus.mkcertAvailable) {
    logger.error('mkcert is required for the simulator PWA flow but was not found in PATH.');
    logger.error('Install mkcert and re-run `npm run dev:pwa:certs:setup`.');
    return;
  }

  logger.error('PWA HTTPS certificates are not configured.');
  logger.error(`Expected cert: ${certStatus.certPath}`);
  logger.error(`Expected key:  ${certStatus.keyPath}`);
  logger.error(
    'Run `npm run dev:pwa:certs:setup` to generate the required localhost certificate files.'
  );
}

export function servePwaRootCertificate(context) {
  const certStatus = getSimulatorCertificateStatus(context);
  if (!certStatus.mkcertAvailable || !certStatus.hasRootCa || !certStatus.rootCaPath) {
    console.error('mkcert root CA is not available.');
    console.error('Run `npm run dev:pwa:certs:setup` first.');
    process.exit(1);
  }

  const serverScript = context.config.worktree.pwa?.rootCaServerScript;
  if (!serverScript) {
    throw new Error('worktree.pwa.rootCaServerScript must be configured');
  }

  console.log(
    `Open http://localhost:${String(context.runtime.ports.PWA_ROOT_CA_PORT)}/rootCA.pem in iPhone Simulator Safari.`
  );
  console.log(
    'Then install the profile and enable full trust in Settings > General > About > Certificate Trust Settings.'
  );

  context.run('node', [
    path.resolve(context.cwd, serverScript),
    '--host',
    '127.0.0.1',
    '--port',
    String(context.runtime.ports.PWA_ROOT_CA_PORT),
    '--file',
    certStatus.rootCaPath,
    '--route',
    '/rootCA.pem',
  ]);
}

export function runPwaServe(context) {
  const certStatus = getSimulatorCertificateStatus(context);
  if (!certStatus.isConfigured) {
    printMissingCertificateInstructions(context);
    process.exit(1);
  }

  const indexPath = path.join(context.buildRoot, 'index.html');
  if (!existsSync(indexPath)) {
    console.error(`Built frontend not found at ${indexPath}`);
    console.error('Run `npm run dev:pwa:build` first or use `npm run dev:pwa:simulator`.');
    process.exit(1);
  }

  const serverScript = context.config.worktree.pwa?.httpsServerScript;
  if (!serverScript) {
    throw new Error('worktree.pwa.httpsServerScript must be configured');
  }

  console.log('Installed PWA mode: serving production build over HTTPS for simulator testing.');
  console.log(
    `Open Safari in iPhone Simulator at https://localhost:${String(context.runtime.ports.PWA_HOST_PORT)}`
  );
  console.log('Then use Share -> Add to Home Screen to launch the standalone PWA.');

  context.run('node', [
    path.resolve(context.cwd, serverScript),
    '--host',
    '127.0.0.1',
    '--port',
    String(context.runtime.ports.PWA_HOST_PORT),
    '--cert',
    certStatus.certPath,
    '--key',
    certStatus.keyPath,
    '--root',
    context.buildRoot,
    '--proxy-origin',
    `http://127.0.0.1:${context.runtime.ports.EDGE_HOST_PORT}`,
  ]);
}

export async function runPwaCommand(
  context,
  command,
  {
    isPortReachableFn = isPortReachable,
    reconcilePwaStackFn,
    buildPwaFn = buildPwa,
    runPwaServeFn = runPwaServe,
    setupPwaCertificatesFn,
    getSimulatorCertificateStatusFn = () => getSimulatorCertificateStatus(context),
    printMissingCertificateInstructionsFn = () => printMissingCertificateInstructions(context),
    servePwaRootCertificateFn = () => servePwaRootCertificate(context),
    exitFn = (code) => process.exit(code),
    logger = console,
  } = {}
) {
  if (command === 'build') {
    buildPwaFn(context);
    logger.log(`PWA build complete: ${context.buildRoot}`);
    logger.log(`Build output entries: ${listBuildOutputEntries(context.buildRoot).join(', ')}`);
    return;
  }

  if (command === 'serve' || command === 'simulator') {
    const requiredPort =
      context.config.worktree.pwa?.requiredReachabilityPort ?? context.runtime.ports.EDGE_HOST_PORT;
    if (!Number.isFinite(requiredPort)) {
      logger.error(
        'PWA reachability check requires worktree.pwa.requiredReachabilityPort or runtime.ports.EDGE_HOST_PORT to be configured.'
      );
      exitFn(1);
      return;
    }
    const edgeReachable = await isPortReachableFn(requiredPort);
    if (!edgeReachable) {
      logger.error(
        `Backend stack not running: edge service is unavailable at http://127.0.0.1:${String(requiredPort)}`
      );
      logger.error(
        `Start it with \`${context.config.worktree.compose?.startCommandHint ?? 'npm run dev:stack:up'}\` before ${command === 'serve' ? 'serving the simulator PWA' : 'running the simulator PWA flow'}.`
      );
      exitFn(1);
      return;
    }

    if (reconcilePwaStackFn) {
      reconcilePwaStackFn(context);
    }
    if (command === 'simulator') {
      buildPwaFn(context);
    }
    runPwaServeFn(context);
    return;
  }

  if (command === 'certs-setup') {
    if (!setupPwaCertificatesFn) {
      throw new Error('setupPwaCertificatesFn is required for certs-setup');
    }
    setupPwaCertificatesFn(context);
    return;
  }

  if (command === 'certs-check') {
    const certStatus = getSimulatorCertificateStatusFn(context);
    if (!certStatus.mkcertAvailable) {
      logger.error('mkcert is required for the simulator PWA flow but was not found in PATH.');
      exitFn(1);
      return;
    }

    if (!certStatus.hasRootCa) {
      logger.error('mkcert root CA was not found.');
      logger.error('Run `npm run dev:pwa:certs:setup` first.');
      exitFn(1);
      return;
    }

    if (!certStatus.isConfigured) {
      printMissingCertificateInstructionsFn(context);
      exitFn(1);
      return;
    }

    logger.log('PWA HTTPS certificates are configured.');
    logger.log(`Cert: ${certStatus.certPath}`);
    logger.log(`Key:  ${certStatus.keyPath}`);
    logger.log(`mkcert root CA: ${certStatus.rootCaPath}`);
    logger.log(
      'For the cleanest Simulator PWA flow, ensure Safari does not show a security warning for this origin.'
    );
    logger.log(
      `If needed, run \`npm run dev:pwa:certs:serve-root\` and open http://localhost:${String(context.runtime.ports.PWA_ROOT_CA_PORT)}/rootCA.pem in iPhone Simulator Safari.`
    );
    return;
  }

  if (command === 'certs-serve-root') {
    servePwaRootCertificateFn(context);
    return;
  }

  logger.error(
    'Unknown pwa command. Use: build | serve | simulator | certs-setup | certs-check | certs-serve-root'
  );
  exitFn(1);
}

export function runComposeCommand(context, action) {
  const composeConfig = context.config.worktree.compose ?? {};
  const services = composeConfig.services ?? [];
  const restartServices = composeConfig.restartServices ?? services;
  const logServices = composeConfig.logServices ?? services;

  if (action === 'up') {
    context.run('docker', [...context.composeArgs, 'up', '-d', '--build', ...services]);
    return;
  }

  if (action === 'down') {
    context.run('docker', [...context.composeArgs, 'down']);
    return;
  }

  if (action === 'restart') {
    context.run('docker', [...context.composeArgs, 'restart', ...restartServices]);
    return;
  }

  if (action === 'logs') {
    context.run('docker', [...context.composeArgs, 'logs', '-f', ...logServices]);
    return;
  }

  if (action === 'ps') {
    context.run('docker', [...context.composeArgs, 'ps']);
    return;
  }

  throw new Error('Unknown stack action. Use: up | down | restart | logs | ps');
}

export function runWorktreeBootstrap(context, { force = false, printInfo = true } = {}) {
  ensureLocalEnvFromSharedTemplate(context, force);
  if (printInfo) {
    printWorktreeInfo(context);
  }
  ensureDependenciesInstalled(context, force);
}
