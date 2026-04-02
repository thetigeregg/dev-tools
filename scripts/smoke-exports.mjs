import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const prettierConfig = await import('@thetigeregg/prettier-config');
const commitlintConfig = await import('@thetigeregg/commitlint-config');
const ncuConfig = await import('@thetigeregg/ncu-config');
const devCli = await import('@thetigeregg/dev-cli');

assert.equal(typeof prettierConfig.default.printWidth, 'number');
assert.deepEqual(commitlintConfig.default.extends, ['@commitlint/config-conventional']);
assert.equal(typeof ncuConfig.default.target, 'function');
assert.equal(typeof devCli.runTaskStartCli, 'function');
assert.equal(typeof devCli.createWorktreeContext, 'function');
assert.equal(typeof devCli.buildWorktreeRuntime, 'function');
assert.equal(typeof devCli.runWorktreeBootstrap, 'function');
assert.equal(typeof devCli.runReleaseVersionCli, 'function');

const result = spawnSync('node', ['./packages/cli/src/index.mjs', '--help'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /Usage: devx/);
