import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadDevxConfig } from '../src/config.mjs';

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'devx-config-test-'));
}

test('loadDevxConfig finds config from nested directories and resolves paths', async () => {
  const repoRoot = makeTempRepo();
  const nestedDir = path.join(repoRoot, 'apps', 'web');
  fs.mkdirSync(nestedDir, { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, 'devx.config.mjs'),
    `export default {
      projectName: 'shared-tools-test',
      worktreeRoot: '.worktrees',
      packageDirs: ['.', 'packages/api'],
      env: {
        exampleFile: '.env.example',
        localFile: '.env.local'
      },
      worktree: {
        adapterModule: './tools/worktree-adapter.mjs'
      }
    };
    `,
    'utf8'
  );

  const config = await loadDevxConfig({ cwd: nestedDir });

  assert.equal(config.repoRoot, repoRoot);
  assert.equal(config.projectName, 'shared-tools-test');
  assert.equal(config.worktreeRootAbsolute, path.join(repoRoot, '.worktrees'));
  assert.equal(config.packageDirPaths[1].absolutePath, path.join(repoRoot, 'packages/api'));
  assert.equal(config.env.exampleFileAbsolute, path.join(repoRoot, '.env.example'));
  assert.equal(config.env.localFileAbsolute, path.join(repoRoot, '.env.local'));
  assert.equal(
    config.worktree.adapterModuleAbsolute,
    path.join(repoRoot, 'tools/worktree-adapter.mjs')
  );
});

test('loadDevxConfig defaults projectName to the repo directory name', async () => {
  const repoRoot = makeTempRepo();
  fs.writeFileSync(
    path.join(repoRoot, 'devx.config.mjs'),
    'export default {};\n',
    'utf8'
  );

  const config = await loadDevxConfig({ cwd: repoRoot });

  assert.equal(config.projectName, path.basename(repoRoot));
});
