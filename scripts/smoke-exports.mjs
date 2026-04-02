import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const prettierConfig = await import('@sixtopia/prettier-config');
const commitlintConfig = await import('@sixtopia/commitlint-config');
const ncuConfig = await import('@sixtopia/ncu-config');
const devCli = await import('@sixtopia/dev-cli');

assert.equal(typeof prettierConfig.default.printWidth, 'number');
assert.deepEqual(commitlintConfig.default.extends, ['@commitlint/config-conventional']);
assert.equal(typeof ncuConfig.default.target, 'function');
assert.equal(typeof devCli.runTaskStartCli, 'function');

const result = spawnSync('node', ['./packages/cli/src/index.mjs', '--help'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /Usage: devx/);
