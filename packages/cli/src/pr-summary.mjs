#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadDevxConfig } from './config.mjs';

const GIT_MAX_BUFFER_BYTES = 1024 * 1024 * 50;

function runGit(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      // Allow large diffs without failing before we can generate the prompt.
      maxBuffer: GIT_MAX_BUFFER_BYTES,
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
    config.pr.summaryOutputFileAbsolute ?? path.join(config.repoRoot, '.pr-review-prompt.md');

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
PR review prompt generated:

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

// Backward compatibility for callers that still import the review-named API.
export const buildReviewPrompt = buildSummaryPrompt;
export const runPrReviewCli = runPrSummaryCli;
