import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  bumpVersion,
  inferBumpType,
  parseSemver,
  runReleaseVersionCli,
} from '../src/release-version.mjs';

function run(command, cwd) {
  return execSync(command, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  }).trim();
}

function createFixtureRepo() {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'dev-cli-release-'));
  writeFileSync(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ name: 'fixture-app', version: '1.2.3', private: true }, null, 2) + '\n'
  );
  writeFileSync(path.join(repoRoot, 'CHANGELOG.md'), '# Changelog\n');
  writeFileSync(
    path.join(repoRoot, 'devx.config.mjs'),
    `export default {
  projectName: 'fixture-app',
  release: {},
};
`
  );

  run('git init', repoRoot);
  run('git config user.name "Test User"', repoRoot);
  run('git config user.email "test@example.com"', repoRoot);
  run('git add package.json CHANGELOG.md devx.config.mjs', repoRoot);
  run('git commit -m "chore: initial release"', repoRoot);
  run('git tag v1.2.3', repoRoot);

  return repoRoot;
}

test('parseSemver and bumpVersion handle supported semver bumps', () => {
  assert.deepEqual(parseSemver('1.2.3'), { major: 1, minor: 2, patch: 3 });
  assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4');
  assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0');
});

test('inferBumpType honors breaking, feat, then patch semantics', () => {
  assert.equal(inferBumpType([{ subject: 'fix(api): patch', body: '' }]), 'patch');
  assert.equal(inferBumpType([{ subject: 'feat(ui): add page', body: '' }]), 'minor');
  assert.equal(inferBumpType([{ subject: 'feat(api)!: change contract', body: '' }]), 'major');
});

test('runReleaseVersionCli bumps and updates changelog from conventional commits', async () => {
  const repoRoot = createFixtureRepo();
  writeFileSync(path.join(repoRoot, 'feature.txt'), 'new feature\n');
  run('git add feature.txt', repoRoot);
  run('git commit -m "feat(cli): add release helper"', repoRoot);

  const result = await runReleaseVersionCli({ cwd: repoRoot, argv: [] });

  assert.equal(result.version, '1.3.0');
  assert.equal(
    JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version,
    '1.3.0'
  );
  assert.match(
    readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8'),
    /## v1\.3\.0 - \d{4}-\d{2}-\d{2}/
  );
  assert.match(
    readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8'),
    /feat\(cli\): add release helper/
  );
});

test('runReleaseVersionCli dry-run leaves files untouched', async () => {
  const repoRoot = createFixtureRepo();
  writeFileSync(path.join(repoRoot, 'fix.txt'), 'bug fix\n');
  run('git add fix.txt', repoRoot);
  run('git commit -m "fix(cli): avoid crash"', repoRoot);

  const beforePackage = readFileSync(path.join(repoRoot, 'package.json'), 'utf8');
  const beforeChangelog = readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
  const result = await runReleaseVersionCli({ cwd: repoRoot, argv: ['--dry-run'] });

  assert.equal(result.version, '1.2.4');
  assert.equal(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'), beforePackage);
  assert.equal(readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8'), beforeChangelog);
});

test('runReleaseVersionCli honors the latest matching prefixed tag', async () => {
  const repoRoot = createFixtureRepo();
  writeFileSync(
    path.join(repoRoot, 'devx.config.mjs'),
    `export default {
  projectName: 'fixture-app',
  release: {
    tagPrefix: 'release-',
  },
};
`
  );

  run('git tag release-1.4.0', repoRoot);
  writeFileSync(path.join(repoRoot, 'fix.txt'), 'bug fix\n');
  run('git add devx.config.mjs fix.txt', repoRoot);
  run('git commit -m "fix(cli): respect prefixed tags"', repoRoot);

  const result = await runReleaseVersionCli({ cwd: repoRoot, argv: ['--dry-run'] });

  assert.equal(result.version, '1.4.1');
});

test('runReleaseVersionCli treats regex-like tag prefixes as plain text', async () => {
  const repoRoot = createFixtureRepo();
  writeFileSync(
    path.join(repoRoot, 'devx.config.mjs'),
    `export default {
  projectName: 'fixture-app',
  release: {
    tagPrefix: 'release.',
  },
};
`
  );

  run('git tag release.1.4.0', repoRoot);
  writeFileSync(path.join(repoRoot, 'fix.txt'), 'bug fix\n');
  run('git add devx.config.mjs fix.txt', repoRoot);
  run('git commit -m "fix(cli): handle dotted tag prefixes"', repoRoot);

  const result = await runReleaseVersionCli({ cwd: repoRoot, argv: ['--dry-run'] });

  assert.equal(result.version, '1.4.1');
});

test('runReleaseVersionCli ignores prerelease tags that do not parse as x.y.z', async () => {
  const repoRoot = createFixtureRepo();
  run('git tag v1.4.0-rc.0', repoRoot);
  writeFileSync(path.join(repoRoot, 'fix.txt'), 'bug fix\n');
  run('git add fix.txt', repoRoot);
  run('git commit -m "fix(cli): ignore prerelease tags for versioning"', repoRoot);

  const result = await runReleaseVersionCli({ cwd: repoRoot, argv: ['--dry-run'] });

  assert.equal(result.version, '1.2.4');
});

test('runReleaseVersionCli keeps prerelease tags out of the commit range base', async () => {
  const repoRoot = createFixtureRepo();

  writeFileSync(path.join(repoRoot, 'feature.txt'), 'feature before prerelease\n');
  run('git add feature.txt', repoRoot);
  run('git commit -m "feat(cli): add prerelease-safe range handling"', repoRoot);
  run('git tag v1.3.0-rc.0', repoRoot);

  writeFileSync(path.join(repoRoot, 'fix.txt'), 'bug fix after prerelease\n');
  run('git add fix.txt', repoRoot);
  run('git commit -m "fix(cli): patch after prerelease"', repoRoot);

  const result = await runReleaseVersionCli({ cwd: repoRoot, argv: ['--dry-run'] });

  assert.equal(result.version, '1.3.0');
});

test('runReleaseVersionCli no-ops when HEAD already matches the latest release tag', async () => {
  const repoRoot = createFixtureRepo();
  const beforePackage = readFileSync(path.join(repoRoot, 'package.json'), 'utf8');
  const beforeChangelog = readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');

  const result = await runReleaseVersionCli({ cwd: repoRoot, argv: [] });

  assert.equal(result.version, '1.2.3');
  assert.equal(result.bumpType, 'none');
  assert.equal(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'), beforePackage);
  assert.equal(readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8'), beforeChangelog);
});

test('runReleaseVersionCli throws when package.json drifts from the latest tag with no new commits', async () => {
  const repoRoot = createFixtureRepo();
  writeFileSync(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ name: 'fixture-app', version: '1.2.4', private: true }, null, 2) + '\n'
  );

  await assert.rejects(
    runReleaseVersionCli({ cwd: repoRoot, argv: ['--dry-run'] }),
    /Current package\.json version \(1\.2\.4\) does not match latest tag version \(1\.2\.3\)/
  );
});

test('runReleaseVersionCli ignores newer release tags that are not reachable from HEAD', async () => {
  const repoRoot = createFixtureRepo();
  const initialBranch = run('git branch --show-current', repoRoot);

  run('git checkout -b release/next', repoRoot);
  writeFileSync(path.join(repoRoot, 'major.txt'), 'major release prep\n');
  run('git add major.txt', repoRoot);
  run('git commit -m "feat(cli): prepare unrelated release branch"', repoRoot);
  run('git tag v9.0.0', repoRoot);
  run(`git checkout ${initialBranch}`, repoRoot);

  writeFileSync(path.join(repoRoot, 'fix.txt'), 'bug fix\n');
  run('git add fix.txt', repoRoot);
  run('git commit -m "fix(cli): stay on reachable tags only"', repoRoot);

  const result = await runReleaseVersionCli({ cwd: repoRoot, argv: ['--dry-run'] });

  assert.equal(result.version, '1.2.4');
});
