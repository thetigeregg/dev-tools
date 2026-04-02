#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadDevxConfig } from './config.mjs';

const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, { cwd }) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function parseSemver(version) {
  const parsed = tryParseSemver(version);
  if (!parsed) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  return parsed;
}

function tryParseSemver(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
}

export function bumpVersion(version, bumpType) {
  const parsed = parseSemver(version);

  if (bumpType === 'major') {
    return `${parsed.major + 1}.0.0`;
  }

  if (bumpType === 'minor') {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }

  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

function compareSemver(leftVersion, rightVersion) {
  const left = tryParseSemver(leftVersion);
  const right = tryParseSemver(rightVersion);
  if (!left || !right) {
    return null;
  }

  if (left.major !== right.major) {
    return left.major - right.major;
  }

  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }

  return left.patch - right.patch;
}

function isReleaseTag(tag, tagPrefix) {
  if (!tag.startsWith(tagPrefix)) {
    return false;
  }

  const versionPart = tag.slice(tagPrefix.length);
  return tryParseSemver(versionPart) !== null;
}

function getLatestTag({ cwd, tagPrefix }) {
  const tags = execFileSync('git', ['tag', '--merged', 'HEAD', '--list', '--sort=-v:refname'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (!tags) {
    return null;
  }

  return (
    tags
      .split('\n')
      .map((tag) => tag.trim())
      .find((tag) => isReleaseTag(tag, tagPrefix)) ?? null
  );
}

function getCommitMessages(range, { cwd }) {
  const log = run('git', ['log', '--format=%s%x1f%b%x1e', range], { cwd });
  if (!log) {
    return [];
  }

  return log
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [subject = '', body = ''] = entry.split('\x1f');
      return { subject: subject.trim(), body: body.trim() };
    });
}

function isReleaseCommitSubject(subject) {
  return /^chore\(release\):/i.test(String(subject || '').trim());
}

export function inferBumpType(commits) {
  const relevantCommits = commits.filter((commit) => !isReleaseCommitSubject(commit.subject));

  if (relevantCommits.length === 0) {
    return 'none';
  }

  for (const commit of relevantCommits) {
    const full = `${commit.subject}\n${commit.body}`;
    if (/BREAKING CHANGE:/i.test(full) || /^[a-z]+(?:\([^)]*\))?!:/i.test(commit.subject)) {
      return 'major';
    }
  }

  for (const commit of relevantCommits) {
    if (/^feat(?:\([^)]*\))?:\s/i.test(commit.subject)) {
      return 'minor';
    }
  }

  return 'patch';
}

function getCommitsForChangelog(range, { cwd }) {
  const log = run('git', ['log', '--format=%h%x1f%s', range], { cwd });
  if (!log) {
    return [];
  }

  return log
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha = '', subject = ''] = line.split('\x1f');
      return { sha: sha.trim(), subject: subject.trim() };
    })
    .filter((entry) => entry.subject && !entry.subject.startsWith('chore(release):'));
}

function updateChangelog(nextVersion, commits, { changelogPath, dryRun }) {
  const today = new Date().toISOString().slice(0, 10);
  const releaseTitle = `## v${nextVersion} - ${today}`;
  const lines =
    commits.length > 0
      ? commits.map((commit) => `- ${commit.sha} ${commit.subject}`)
      : ['- Maintenance release'];
  const entry = `${releaseTitle}\n${lines.join('\n')}\n`;

  const existing = existsSync(changelogPath)
    ? readFileSync(changelogPath, 'utf8').trim()
    : '# Changelog';
  const normalized = existing.length > 0 ? existing : '# Changelog';
  const next = `${normalized}\n\n${entry}\n`;

  if (!dryRun) {
    writeFileSync(changelogPath, next);
  }
}

function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    writeFileSync(outputPath, `${name}=${value}\n`, { flag: 'a' });
  }
}

export async function runReleaseVersionCli({
  cwd = process.cwd(),
  argv = process.argv.slice(2),
} = {}) {
  const dryRun = argv.includes('--dry-run');
  const config = await loadDevxConfig({ cwd });
  const packageJsonPath =
    config.release.packageJsonFileAbsolute ?? path.join(config.repoRoot, 'package.json');
  const changelogPath =
    config.release.changelogFileAbsolute ?? path.join(config.repoRoot, 'CHANGELOG.md');
  const tagPrefix = config.release.tagPrefix ?? 'v';

  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const currentVersion = pkg.version;
  if (!currentVersion) {
    throw new Error(`${packageJsonPath} is missing a version field.`);
  }

  const latestTag = getLatestTag({ cwd: config.repoRoot, tagPrefix });
  const latestTagVersion =
    latestTag && latestTag.startsWith(tagPrefix) ? latestTag.slice(tagPrefix.length) : latestTag;
  const comparedLatestTagVersion =
    latestTagVersion && compareSemver(latestTagVersion, currentVersion);
  const releaseBaseVersion =
    typeof comparedLatestTagVersion === 'number' && comparedLatestTagVersion > 0
      ? latestTagVersion
      : currentVersion;
  const range = latestTag ? `${latestTag}..HEAD` : 'HEAD';
  const commits = getCommitMessages(range, { cwd: config.repoRoot });
  if (latestTag && commits.length === 0) {
    if (latestTagVersion && latestTagVersion !== currentVersion) {
      throw new Error(
        `Current package.json version (${currentVersion}) does not match latest tag version (${latestTagVersion}). ` +
          `There are no commits after the latest tag (${latestTag}). Ensure package.json is in sync with the latest ` +
          `release tag or create a new commit before running the release script.`
      );
    }

    const parsedCurrentVersion = parseSemver(currentVersion);

    setOutput('version', currentVersion);
    setOutput('major', String(parsedCurrentVersion.major));
    setOutput('minor', String(parsedCurrentVersion.minor));
    setOutput('tag', `${tagPrefix}${currentVersion}`);
    setOutput('bump_type', 'none');

    process.stdout.write(`${currentVersion}\n`);

    return {
      version: currentVersion,
      major: parsedCurrentVersion.major,
      minor: parsedCurrentVersion.minor,
      tag: `${tagPrefix}${currentVersion}`,
      bumpType: 'none',
    };
  }

  const bumpType = inferBumpType(commits);
  if (bumpType === 'none') {
    const parsedCurrentVersion = parseSemver(currentVersion);

    setOutput('version', currentVersion);
    setOutput('major', String(parsedCurrentVersion.major));
    setOutput('minor', String(parsedCurrentVersion.minor));
    setOutput('tag', `${tagPrefix}${currentVersion}`);
    setOutput('bump_type', 'none');

    process.stdout.write(`${currentVersion}\n`);

    return {
      version: currentVersion,
      major: parsedCurrentVersion.major,
      minor: parsedCurrentVersion.minor,
      tag: `${tagPrefix}${currentVersion}`,
      bumpType: 'none',
    };
  }

  const nextVersion = bumpVersion(releaseBaseVersion, bumpType);
  const changelogCommits = getCommitsForChangelog(range, { cwd: config.repoRoot });

  if (!dryRun) {
    run(NPM_COMMAND, ['version', nextVersion, '--no-git-tag-version'], {
      cwd: path.dirname(packageJsonPath),
    });
    updateChangelog(nextVersion, changelogCommits, { changelogPath, dryRun });
  }

  const parsed = parseSemver(nextVersion);
  const tag = `${tagPrefix}${nextVersion}`;

  setOutput('version', nextVersion);
  setOutput('major', String(parsed.major));
  setOutput('minor', String(parsed.minor));
  setOutput('tag', tag);
  setOutput('bump_type', bumpType);

  process.stdout.write(`${nextVersion}\n`);

  return {
    version: nextVersion,
    major: parsed.major,
    minor: parsed.minor,
    tag,
    bumpType,
  };
}

export function isEntrypoint({ argv1 = process.argv[1], moduleUrl = import.meta.url } = {}) {
  if (!argv1) {
    return false;
  }

  return pathToFileURL(path.resolve(argv1)).href === moduleUrl;
}

if (isEntrypoint()) {
  await runReleaseVersionCli();
}
