#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadDevxConfig } from './config.mjs';

const GIT_MAX_BUFFER_BYTES = 1024 * 1024 * 50;
const PRE_PR_REVIEW_INSTRUCTIONS = `# Pre-PR Automated Code Review Prompt (Agent Optimized)

You are an automated pre-pull-request cleanup and PR summary agent.

Your job is to analyze this branch against the base branch and improve the patch before generating the final PR write-up.

When applying fixes:
- Prefer small deterministic changes
- Preserve behavior unless fixing a clear bug
- Follow repository conventions
- Avoid large unrelated refactors
- Focus primarily on code changed in this branch

## 1) Determine the change set
- Use the changed-files list and diff below as the source of truth.
- Build an internal summary of:
  - files changed, added, removed, renamed
  - dependency/configuration updates
  - overall change type (feature, fix, refactor, dependency, infrastructure/config)

## 2) Validate build and test health
- Run repository-standard quality checks as available (for example: install, build, lint, test, format).
- If checks fail:
  - determine whether the patch introduced the issue
  - fix implementation problems when safe
  - update tests when behavior changes are intentional
- Do not remove failing tests unless they are clearly invalid.

## 3) Evaluate patch coverage
- Focus on coverage and test confidence for changed lines.
- Aim for strong coverage of branch logic, validation, error paths, API contracts, and edge cases.
- Prefer tests that are deterministic and aligned with existing project style.

## 4) Generate missing tests when needed
- Add targeted tests for:
  - conditional branches
  - failure/error handling
  - boundary and invalid inputs
  - response and contract expectations

## 5) Review regression risk
- Check for:
  - changed function signatures or return contracts
  - removed/renamed public behavior
  - query/data-access behavior shifts
  - API response changes
  - default configuration changes
- Update callers and add regression tests when risks are identified.

## 6) Perform security review
- Inspect for:
  - input-validation gaps and injection risks
  - authentication/authorization bypass risk
  - secret leakage in code or logs
  - sensitive data exposure in outputs/errors
- Fix any clear issues discovered.

## 7) Check deployment safety
- Verify production-readiness for:
  - data/migration compatibility and rollback safety
  - runtime stability (no obvious blocking loops/leaks/hot-path regressions)
  - required configuration/env coverage with safe defaults
  - robust error handling

## 8) Improve quality and maintainability
- Safely reduce duplication and unnecessary complexity.
- Improve naming clarity where needed.
- Keep edits minimal and scoped to this branch.

## 9) Review performance risk
- Look for:
  - repeated expensive operations
  - inefficient loops
  - N+1 query patterns
  - redundant serialization/deserialization
- Optimize only when improvements are clear and low risk.

## 10) Style and consistency
- Ensure formatting/lint/style follow repository standards.
- Do not reformat unrelated files.

## 11) Documentation alignment
- Update relevant docs/comments when behavior, config, or public usage changed.

## 12) Dependency hygiene
- For dependency updates, verify they are necessary, compatible, and used.
- Remove unused additions when safe.

## 13) Cleanup
- Remove dead code, unused imports, temporary debug artifacts, and stale commented-out blocks introduced by the patch.

## 14) Final output format
Provide a concise report with:
1. Change Summary
2. Fixes Applied
3. Patch Coverage Notes
4. Security Review
5. Remaining Risks

Output requirements:
1. Apply safe fixes automatically where confidence is high.
2. Prefer minimal targeted patches.
3. Do not introduce breaking changes unless fixing a bug.
4. Keep changes limited to this branch context.`;

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
${PRE_PR_REVIEW_INSTRUCTIONS}

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
    config.pr.reviewOutputFileAbsolute ?? path.join(config.repoRoot, '.pr-review-prompt.md');

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

// Forward-compatibility aliases: keep summary-named internals while exposing the new review-named API.
export const buildReviewPrompt = buildSummaryPrompt;
export const runPrReviewCli = runPrSummaryCli;
