#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadDevxConfig } from './config.mjs';

function runGit(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024 * 10,
    });
  } catch (error) {
    console.error(`Failed to run command: git ${args.join(' ')}`);

    if (error.stdout) {
      process.stdout.write(error.stdout);
    }
    if (error.stderr) {
      process.stderr.write(error.stderr);
    }

    const code = typeof error.status === 'number' ? error.status : 1;
    process.exit(code);
  }
}

export function buildSummaryPrompt(diff, files) {
  return `
Generate a pull request description.

Use the repository template located at:

.github/pull_request_template.md

Requirements:

- Title must follow Conventional Commits
- Base the explanation strictly on the git diff
- Do NOT invent behavior or features
- Fill every section of the PR template
- Be technically precise and concise

Before writing the PR description, do a brief pre-PR review of the patch:

- identify the main change type: feature, bug fix, refactor, dependency update, or infrastructure/config
- call out obvious regression risks from changed signatures, return values, queries, or config defaults
- note whether changed logic appears covered by tests, especially on branches and failure paths
- mention tests that are present in the diff instead of saying they are missing; if coverage is still partial, clarify the remaining gap precisely
- mention any obvious security, production-safety, or performance concerns introduced by the diff
- keep this review focused on the current patch and avoid unrelated refactors

Changed files:

${files}

Git diff:

${diff}
`;
}

export async function runPrSummaryCli({ cwd = process.cwd() } = {}) {
  const config = await loadDevxConfig({ cwd });
  const baseRef = config.pr.baseRef ?? `origin/${config.baseBranch}`;
  const diffRange = `${baseRef}...HEAD`;
  const excludedPaths = config.pr.excludedDiffPaths ?? [
    ':(glob,exclude)**/package-lock.json',
    ':(glob,exclude)**/dist/**',
  ];
  const outputFile =
    config.pr.summaryOutputFileAbsolute ?? path.join(config.repoRoot, '.pr-summary-prompt.md');

  const diff = runGit(['diff', diffRange, '--', '.', ...excludedPaths], config.repoRoot);

  if (!diff.trim()) {
    console.log(`No changes detected vs ${baseRef}.`);
    return { outputFile, wroteFile: false };
  }

  const files = runGit(
    ['diff', '--name-only', diffRange, '--', '.', ...excludedPaths],
    config.repoRoot
  );
  const prompt = buildSummaryPrompt(diff, files);

  fs.writeFileSync(outputFile, prompt);

  console.log(`
PR summary prompt generated:

${path.relative(config.repoRoot, outputFile) || outputFile}

Open it in Agent and ask the agent to generate the PR description.
`);

  return { outputFile, wroteFile: true };
}

export function isEntrypoint({ argv1 = process.argv[1], moduleUrl = import.meta.url } = {}) {
  if (!argv1) {
    return false;
  }

  return pathToFileURL(path.resolve(argv1)).href === moduleUrl;
}

if (isEntrypoint()) {
  await runPrSummaryCli();
}
