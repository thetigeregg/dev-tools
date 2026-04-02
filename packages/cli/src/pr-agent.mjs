#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadDevxConfig } from './config.mjs';

const GH_MAX_BUFFER_BYTES = 1024 * 1024 * 50;
const DEFAULT_MAX_DIFF_CHARS = 120000;
const DEFAULT_LOG_TERMS = [
  'does not meet',
  'Coverage for',
  'FAIL',
  'Error:',
  'Test Suites:',
  'AssertionError',
  'ERR!',
  'Unhandled',
  'Exception',
];

export function parseArgs(args) {
  const options = {
    prNumber: null,
    debug: false,
    copilotOnly: false,
    includeCoverage: false,
  };

  for (const arg of args) {
    if (arg === '--debug') {
      options.debug = true;
    } else if (arg === '--copilot-only') {
      options.copilotOnly = true;
    } else if (arg === '--include-coverage') {
      options.includeCoverage = true;
    } else if (!options.prNumber) {
      options.prNumber = arg;
    }
  }

  if (!options.prNumber) {
    console.error(
      'Usage: devx pr agent <PR_NUMBER> [--copilot-only] [--include-coverage] [--debug]'
    );
    process.exit(1);
  }

  return options;
}

function maybeOpenInVSCode(filePath) {
  const commands = process.platform === 'win32' ? ['code.cmd', 'code.exe', 'code'] : ['code'];

  for (const command of commands) {
    const result = spawnSync(command, [filePath], { stdio: 'ignore' });
    if (!result.error && result.status === 0) {
      return;
    }
    if (result.error?.code === 'ENOENT') {
      continue;
    }

    const failureReason = result.error?.message || `exit code ${result.status}`;
    console.warn(`VS Code CLI launch failed for ${filePath}: ${failureReason}`);
    return;
  }

  console.log('VS Code CLI code not found; skipping auto-open');
}

function isAutomatedSecurityAuthor(authorLogin) {
  const normalizedAuthorLogin = String(authorLogin || '').toLowerCase();
  return (
    normalizedAuthorLogin.includes('github-advanced-security') ||
    normalizedAuthorLogin.includes('github-code-scanning')
  );
}

function isActionableThread(thread) {
  if (!thread) return false;
  if (thread.isResolved) return false;
  if (!thread.isOutdated) return true;

  const firstCommentAuthor = thread.firstComments?.nodes?.[0]?.author?.login || '';
  const comments = (thread.comments?.nodes || []).filter(Boolean);
  const hasAutomatedSecurityThread =
    isAutomatedSecurityAuthor(firstCommentAuthor) ||
    comments.some((comment) => isAutomatedSecurityAuthor(comment.author?.login));

  return !hasAutomatedSecurityThread;
}

function runGh(args, debug, { allowFailure = false } = {}) {
  if (debug) {
    console.log('[debug]', 'gh', args.join(' '));
  }

  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: GH_MAX_BUFFER_BYTES,
    });
  } catch (err) {
    const command = `gh ${args.join(' ')}`;

    if (allowFailure) {
      if (debug) {
        console.log('[debug]', 'Command failed (allowed):', command);
      }
      return null;
    }

    console.error('GitHub CLI command failed:', command);
    if (err.stdout) process.stdout.write(err.stdout);
    if (err.stderr) process.stderr.write(err.stderr);
    process.exit(1);
  }
}

function normalizeStatusChecks(statusCheckRollup) {
  if (Array.isArray(statusCheckRollup)) return statusCheckRollup.filter(Boolean);
  if (!statusCheckRollup || typeof statusCheckRollup !== 'object') return [];

  const candidateCollections = [
    statusCheckRollup.contexts,
    statusCheckRollup.contexts?.nodes,
    statusCheckRollup.nodes,
    statusCheckRollup.edges,
    statusCheckRollup.contexts?.edges,
  ];

  for (const candidate of candidateCollections) {
    if (Array.isArray(candidate)) {
      return candidate.map((item) => item?.node || item).filter(Boolean);
    }
  }

  if ('status' in statusCheckRollup || 'conclusion' in statusCheckRollup) {
    return [statusCheckRollup];
  }

  return [];
}

function getRepoInfo(debug) {
  const result = JSON.parse(runGh(['repo', 'view', '--json', 'nameWithOwner'], debug));
  const [owner, repo] = result.nameWithOwner.split('/');
  return { owner, repo, nameWithOwner: result.nameWithOwner };
}

function getPRData(prNumber, debug) {
  const data = JSON.parse(
    runGh(
      [
        'pr',
        'view',
        prNumber,
        '--json',
        'title,headRefOid,headRefName,files,comments,reviews,statusCheckRollup',
      ],
      debug
    )
  );

  return {
    title: data.title,
    sha: data.headRefOid,
    headRefName: data.headRefName,
    files: (data.files || []).map((file) => file.path),
    comments: data.comments || [],
    reviews: data.reviews || [],
    checks: normalizeStatusChecks(data.statusCheckRollup),
  };
}

function analyzeChecks(checks) {
  const ciFailures = [];
  const coverageFailures = [];
  const pending = [];
  const successes = [];

  for (const check of checks) {
    const normalized = {
      name: check.name || check.context || 'Unnamed check',
      status: check.status || 'UNKNOWN',
      conclusion: check.conclusion || null,
      detailsUrl: check.detailsUrl || check.url || null,
      workflowName: check.workflowName || null,
    };

    if (normalized.status !== 'COMPLETED') {
      pending.push(normalized);
      continue;
    }

    if (normalized.conclusion === 'SUCCESS') {
      successes.push(normalized);
      continue;
    }

    if (normalized.conclusion === 'FAILURE' || normalized.conclusion === 'TIMED_OUT') {
      if (/codecov|coverage/i.test(normalized.name)) {
        coverageFailures.push(normalized);
      } else {
        ciFailures.push(normalized);
      }
    }
  }

  return { ciFailures, coverageFailures, pending, successes };
}

function isIgnoredAutomationAuthor(author) {
  const authorLogin = (author || '').toLowerCase();
  return authorLogin.includes('github-actions') || authorLogin.includes('codecov');
}

function getReviewStateLabel(state) {
  switch (state) {
    case 'APPROVED':
      return 'Approved';
    case 'CHANGES_REQUESTED':
      return 'Changes requested';
    case 'COMMENTED':
      return 'Commented';
    case 'DISMISSED':
      return 'Dismissed';
    case 'PENDING':
      return 'Pending';
    default:
      return null;
  }
}

function isActionableReviewState(state) {
  return state === 'CHANGES_REQUESTED';
}

function formatReviewBody(body, state) {
  if (body) return body;
  const stateLabel = getReviewStateLabel(state);
  return stateLabel ? `Review state: ${stateLabel}` : '';
}

function includeReviewItem(body, author, state) {
  const authorLogin = (author || '').toLowerCase();
  const formattedBody = formatReviewBody(body, state);
  const normalizedBody = formattedBody.toLowerCase();

  if (isIgnoredAutomationAuthor(authorLogin)) return false;
  if (!formattedBody) return false;

  if (
    authorLogin.includes('copilot') &&
    (normalizedBody.includes('pull request overview') ||
      normalizedBody.includes('reviewed') ||
      normalizedBody.includes('summary per file'))
  ) {
    return false;
  }

  return true;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .trim();
}

export function isCopilotReviewAuthor(author) {
  const normalizedAuthor = String(author || '').toLowerCase();
  return normalizedAuthor.includes('copilot');
}

function uniqueBy(items, makeKey) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = makeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

export function collectDiscussionReviewItems(comments, reviews, { copilotOnly = false } = {}) {
  const results = [];

  for (const comment of comments) {
    const author = comment.author?.login || 'reviewer';
    const normalizedBody = normalizeText(comment.body ?? '');
    if (!includeReviewItem(normalizedBody, author)) continue;
    if (copilotOnly && !isCopilotReviewAuthor(author)) continue;

    results.push({
      author,
      body: normalizedBody,
      file: comment.path ?? null,
      line: comment.line ?? null,
      state: null,
    });
  }

  for (const review of reviews) {
    const trimmedBody = review.body?.trim();
    if (!isActionableReviewState(review.state)) continue;

    const author = review.author?.login || 'reviewer';
    if (!includeReviewItem(trimmedBody, author, review.state)) continue;
    if (copilotOnly && !isCopilotReviewAuthor(author)) continue;

    const body = formatReviewBody(trimmedBody, review.state);
    results.push({
      author,
      body: normalizeText(body),
      file: null,
      line: null,
      state: review.state || null,
    });
  }

  return uniqueBy(
    results,
    (item) =>
      `${item.author}|${item.file ?? ''}|${item.line ?? ''}|${item.state ?? ''}|${item.body}`
  );
}

function fetchReviewThreads(repoInfo, prNumber, debug) {
  const warnings = [];
  const threads = [];
  let cursor = null;
  let hasNextPage = true;

  const query = `
query($owner:String!, $repo:String!, $pr:Int!, $cursor:String) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$pr) {
      reviewThreads(first:50, after:$cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          isResolved
          isOutdated
          path
          line
          originalLine
          firstComments: comments(first:1) { nodes { author { login } } }
          comments(last:50) { nodes { author { login } body diffHunk } }
        }
      }
    }
  }
}
`;

  while (hasNextPage) {
    const args = [
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-F',
      `owner=${repoInfo.owner}`,
      '-F',
      `repo=${repoInfo.repo}`,
      '-F',
      `pr=${prNumber}`,
    ];

    if (cursor) args.push('-F', `cursor=${cursor}`);

    const result = runGh(args, debug, { allowFailure: true });
    if (!result) {
      warnings.push(
        'Review threads were unavailable, so inline review feedback may be incomplete.'
      );
      return { threads: [], warnings };
    }

    const data = JSON.parse(result);
    const page = data?.data?.repository?.pullRequest?.reviewThreads;
    if (!page) {
      warnings.push(
        'Review threads were unavailable, so inline review feedback may be incomplete.'
      );
      return { threads: [], warnings };
    }

    threads.push(...(page.nodes || []));
    hasNextPage = Boolean(page.pageInfo?.hasNextPage);
    cursor = page.pageInfo?.endCursor || null;
  }

  return { threads, warnings };
}

function buildInlineReviewTasks(threads, { copilotOnly = false } = {}) {
  const tasks = [];

  for (const thread of threads) {
    if (!isActionableThread(thread)) continue;

    const comments = thread.comments?.nodes || [];
    if (!comments.length) continue;

    const reviewerComment = [...comments].reverse().find((comment) => {
      const author = comment.author?.login || '';
      if (!includeReviewItem(comment.body, author)) return false;
      if (!copilotOnly) return true;
      return isCopilotReviewAuthor(author);
    });

    if (!reviewerComment) continue;

    tasks.push({
      file: thread.path || null,
      line: thread.line ?? thread.originalLine ?? null,
      author: reviewerComment.author?.login || 'reviewer',
      body: normalizeText(reviewerComment.body),
      diff: normalizeText(reviewerComment.diffHunk),
    });
  }

  return uniqueBy(
    tasks,
    (item) => `${item.author}|${item.file}|${item.line}|${item.body}|${item.diff}`
  );
}

function groupReviewTasksByFile(tasks) {
  const map = new Map();
  for (const task of tasks) {
    const key = task.file || '(general)';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(task);
  }
  return map;
}

function getDiff(prNumber, debug, maxDiffChars) {
  const diff = runGh(['pr', 'diff', prNumber], debug, { allowFailure: true });

  if (!diff) {
    return {
      diff: '',
      warnings: [
        'Pull request diff was unavailable, so the generated prompt does not include diff context.',
      ],
    };
  }

  if (diff.length > maxDiffChars) {
    return {
      diff: diff.slice(0, maxDiffChars),
      warnings: [
        `Pull request diff was truncated to ${maxDiffChars} characters to keep the prompt manageable.`,
      ],
    };
  }

  return { diff, warnings: [] };
}

function getLatestWorkflowRun(headRefName, workflowName, debug, { allowFailure = false } = {}) {
  const result = runGh(
    [
      'run',
      'list',
      '--branch',
      headRefName,
      '--json',
      'databaseId,workflowName,event,headBranch,status,conclusion,createdAt,updatedAt',
      '--limit',
      '50',
    ],
    debug,
    { allowFailure }
  );

  if (!result) {
    return { run: null, inspectionFailed: true };
  }

  const runs = JSON.parse(result);
  return {
    run:
      runs.find(
        (run) =>
          run.workflowName === workflowName &&
          run.event === 'pull_request' &&
          run.headBranch === headRefName
      ) || null,
    inspectionFailed: false,
  };
}

function getJobs(runId, debug) {
  const result = runGh(['run', 'view', String(runId), '--json', 'jobs'], debug, {
    allowFailure: true,
  });
  if (!result) return [];
  const parsed = JSON.parse(result);
  return Array.isArray(parsed.jobs) ? parsed.jobs : [];
}

function findFailedSteps(jobs) {
  const failures = [];
  for (const job of jobs) {
    if (!Array.isArray(job.steps)) continue;
    for (const step of job.steps) {
      if (step.conclusion === 'failure') {
        failures.push({
          job: job.name || 'Unnamed job',
          step: step.name || 'Unnamed step',
          jobId: job.databaseId,
        });
      }
    }
  }
  return failures;
}

function getJobLog(runId, jobId, debug) {
  return runGh(['run', 'view', String(runId), '--job', String(jobId), '--log'], debug, {
    allowFailure: true,
  });
}

function extractRelevantLogLines(logs, normalizedLogTerms) {
  const lines = String(logs || '').split('\n');
  const errorIndex = lines.findIndex((line) => {
    const normalizedLine = line.toLowerCase();
    return normalizedLogTerms.some((term) => normalizedLine.includes(term));
  });

  if (errorIndex === -1) return lines.slice(-40);
  return lines.slice(Math.max(0, errorIndex - 20), Math.min(lines.length, errorIndex + 20));
}

function collectCITasks(prData, checkAnalysis, debug, workflowName, normalizedLogTerms) {
  const warnings = [];
  const tasks = [];
  let run = null;

  const workflowRunData = getLatestWorkflowRun(prData.headRefName, workflowName, debug, {
    allowFailure: true,
  });

  run = workflowRunData.run;

  if (workflowRunData.inspectionFailed) {
    warnings.push(
      `Unable to inspect CI workflow runs for branch ${prData.headRefName}; workflow-based CI details may be incomplete.`
    );
  }

  if (!run) {
    if (checkAnalysis.ciFailures.length && !workflowRunData.inspectionFailed) {
      warnings.push(
        `A failing CI status was detected, but no pull_request workflow run named "${workflowName}" was found for branch ${prData.headRefName}.`
      );
    }
    return { run: null, tasks: [], warnings };
  }

  const jobs = getJobs(run.databaseId, debug);
  const failures = findFailedSteps(jobs);

  if (!failures.length && checkAnalysis.ciFailures.length) {
    warnings.push(
      'CI checks are failing, but no explicit failing steps were detected from workflow jobs. Falling back to check-level status only.'
    );
  }

  for (const failure of failures) {
    const rawLogs = getJobLog(run.databaseId, failure.jobId, debug);
    const relevantLogs = extractRelevantLogLines(rawLogs || '', normalizedLogTerms).filter(Boolean);

    if (!rawLogs) {
      warnings.push(`Logs were unavailable for failing job "${failure.job}".`);
    }

    tasks.push({ ...failure, relevantLogs, logAvailable: Boolean(rawLogs) });
  }

  return { run, tasks, warnings };
}

function downloadCoverageArtifact(runId, debug, coverageArtifactName) {
  const runArtifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-agent-coverage-'));

  const result = spawnSync(
    'gh',
    ['run', 'download', String(runId), '-n', coverageArtifactName, '-D', runArtifactDir],
    {
      encoding: 'utf8',
      maxBuffer: GH_MAX_BUFFER_BYTES,
      stdio: debug ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    }
  );

  if (result.status !== 0) {
    fs.rmSync(runArtifactDir, { recursive: true, force: true });
    return null;
  }

  const extractedDir = path.join(runArtifactDir, coverageArtifactName);
  if (fs.existsSync(extractedDir)) {
    for (const entry of fs.readdirSync(extractedDir)) {
      fs.renameSync(path.join(extractedDir, entry), path.join(runArtifactDir, entry));
    }
    fs.rmSync(extractedDir, { recursive: true, force: true });
  }

  return runArtifactDir;
}

function parseLcov(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let currentFile = null;
  const uncovered = {};

  for (const line of content.split('\n')) {
    if (line.startsWith('SF:')) {
      currentFile = line.slice(3);
      continue;
    }
    if (!line.startsWith('DA:') || !currentFile) continue;
    const [lineNumber, hits] = line.slice(3).split(',');
    if (Number(hits) !== 0) continue;
    if (!uncovered[currentFile]) uncovered[currentFile] = [];
    uncovered[currentFile].push(Number(lineNumber));
  }

  return uncovered;
}

function collectLcovFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectLcovFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.info')) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectCoverage(artifactDir) {
  const uncovered = {};
  for (const filePath of collectLcovFiles(artifactDir)) {
    const parsed = parseLcov(filePath);
    for (const coveredFile of Object.keys(parsed)) {
      if (!uncovered[coveredFile]) uncovered[coveredFile] = [];
      uncovered[coveredFile].push(...parsed[coveredFile]);
    }
  }
  return uncovered;
}

function dedupeAndSortNumbers(values) {
  return [...new Set(values.map((value) => Number(value)).filter(Number.isFinite))].sort(
    (a, b) => a - b
  );
}

function intersectCoverageWithPRFiles(uncovered, prFiles) {
  const tasks = {};
  for (const coverageFile of Object.keys(uncovered)) {
    const match = prFiles.find((prFile) => coverageFile.endsWith(prFile));
    if (!match) continue;
    tasks[match] = dedupeAndSortNumbers([...(tasks[match] || []), ...uncovered[coverageFile]]);
  }
  return tasks;
}

export function extractSnippet(filePath, lines, { repoRoot = process.cwd() } = {}) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  if (!fs.existsSync(absolutePath) || !lines.length) return '';
  const content = fs.readFileSync(absolutePath, 'utf8').split('\n');
  const start = Math.max(Math.min(...lines) - 3, 0);
  const end = Math.min(Math.max(...lines) + 3, content.length);
  return content.slice(start, end).join('\n').trim();
}

function collectCoverageTasks(
  prData,
  debug,
  coverageArtifactName,
  { preferredRunId = null, includeCoverage = false, hasCoverageFailures = false } = {}
) {
  if (!includeCoverage && !hasCoverageFailures) {
    return { run: null, tasks: [], warnings: [] };
  }
  if (!preferredRunId) {
    return {
      run: null,
      tasks: [],
      warnings: [
        'Coverage artifact inspection was skipped because no matching workflow run was identified for this PR.',
      ],
    };
  }

  const artifactDir = downloadCoverageArtifact(preferredRunId, debug, coverageArtifactName);
  if (!artifactDir) {
    return {
      run: { databaseId: preferredRunId },
      tasks: [],
      warnings: [
        `Coverage artifact "${coverageArtifactName}" was not available on workflow run ${preferredRunId}.`,
      ],
    };
  }

  try {
    const uncovered = collectCoverage(artifactDir);
    const intersected = intersectCoverageWithPRFiles(uncovered, prData.files);
    const tasks = Object.keys(intersected).map((filePath) => ({
      file: filePath,
      lines: intersected[filePath],
      snippet: extractSnippet(filePath, intersected[filePath], { repoRoot: prData.repoRoot }),
    }));

    return {
      run: { databaseId: preferredRunId },
      tasks,
      warnings: tasks.length
        ? []
        : [
            'Coverage artifacts were downloaded, but no uncovered lines matched the files modified in this PR.',
          ],
    };
  } finally {
    fs.rmSync(artifactDir, { recursive: true, force: true });
  }
}

function bulletList(items) {
  return items.map((item) => `• ${item}`).join('\n');
}

function buildCurrentStatus(data) {
  const ciStatus =
    data.checks.ciFailures.length > 0
      ? `FAIL (${data.checks.ciFailures.length} failing check${data.checks.ciFailures.length === 1 ? '' : 's'})`
      : data.checks.pending.length > 0
        ? `PENDING (${data.checks.pending.length} running or queued check${data.checks.pending.length === 1 ? '' : 's'})`
        : 'PASS';

  const coverageStatus =
    data.checks.coverageFailures.length > 0
      ? `FAIL (${data.checks.coverageFailures.length} failing coverage check${data.checks.coverageFailures.length === 1 ? '' : 's'})`
      : data.coverage.tasks.length > 0
        ? `ACTION NEEDED (${data.coverage.tasks.length} changed file${data.coverage.tasks.length === 1 ? '' : 's'} with uncovered lines)`
        : 'PASS';

  const reviewCount = data.review.inline.length + data.review.general.length;
  const reviewStatus =
    reviewCount > 0
      ? `ACTION NEEDED (${reviewCount} unresolved review item${reviewCount === 1 ? '' : 's'})`
      : 'PASS';

  let focus =
    'Everything currently looks green. Verify the latest state and avoid unnecessary changes.';

  if (data.checks.ciFailures.length > 0) {
    focus = 'Focus first on fixing failing CI checks and the underlying root causes.';
  } else if (data.coverage.tasks.length > 0 || data.checks.coverageFailures.length > 0) {
    focus = 'Focus on adding or updating tests for changed code with coverage gaps.';
  } else if (reviewCount > 0) {
    focus = 'Focus only on resolving the remaining review feedback.';
  } else if (data.checks.pending.length > 0) {
    focus = 'Wait for pending checks to finish before assuming the PR is complete.';
  }

  return [
    '# Current Status',
    '',
    `CI: ${ciStatus}`,
    `Coverage: ${coverageStatus}`,
    `Review feedback: ${reviewStatus}`,
    '',
    `Focus: ${focus}`,
  ].join('\n');
}

function buildPrompt(data, config) {
  const verifyCommands = config.pr.verifyCommands ?? [
    'npm run lint',
    'npm run test',
    'npm run build',
  ];
  const additionalVerifyCommands = config.pr.additionalVerifyCommands ?? [];

  const sections = [];
  sections.push(`# Pull Request Agent Task\n\nPR: #${data.pr}\nTitle: ${data.title}`);
  sections.push(buildCurrentStatus(data));
  sections.push(
    [
      '# Fix Strategy',
      '',
      'Work through the following priorities in order:',
      '',
      '1. Fix CI failures',
      '2. Fix failing tests',
      '3. Address uncovered code in changed files',
      '4. Resolve unresolved review comments',
      '5. Ensure linting and build succeed',
      '',
      'Always fix root causes rather than suppressing errors.',
      'Avoid unrelated refactors.',
    ].join('\n')
  );

  if (data.warnings.length) {
    sections.push(`# Prompt Warnings\n\n${bulletList(data.warnings)}`);
  }

  sections.push(
    `# Changed Files\n\n${bulletList(data.files.length ? data.files : ['No changed files reported'])}`
  );

  if (data.ci.tasks.length || data.checks.ciFailures.length) {
    let md = '# CI Failure Tasks\n';
    if (data.ci.run?.databaseId) {
      md += `\nWorkflow run: ${data.ci.run.databaseId}`;
    }
    md += '\n';

    if (data.ci.tasks.length) {
      data.ci.tasks.forEach((task, index) => {
        md += `\n## ${index + 1}. ${task.job} -> ${task.step}\n`;
        if (task.relevantLogs.length) {
          md += `\n\`\`\`\n${task.relevantLogs.join('\n')}\n\`\`\`\n`;
        }
      });
    } else {
      md += `\n${bulletList(data.checks.ciFailures.map((check) => check.name))}\n`;
    }

    sections.push(md.trim());
  }

  if (data.coverage.tasks.length) {
    const md = [
      '# Coverage Tasks',
      '',
      ...data.coverage.tasks.map((task, index) =>
        [
          `## ${index + 1}. ${task.file}`,
          '',
          `Uncovered lines: ${task.lines.join(', ')}`,
          task.snippet ? `\n\`\`\`\n${task.snippet}\n\`\`\`` : '',
        ].join('\n')
      ),
    ].join('\n');
    sections.push(md.trim());
  }

  if (data.review.inline.length) {
    const grouped = data.review.inlineByFile;
    let md = '# Inline Review Tasks\n';
    for (const [file, tasks] of grouped.entries()) {
      md += `\n## ${file}\n`;
      tasks.forEach((task, index) => {
        md += `\n${index + 1}. ${task.author}`;
        if (task.line != null) md += ` (line ${task.line})`;
        md += `\n${task.body}\n`;
        if (task.diff) md += `\n\`\`\`diff\n${task.diff}\n\`\`\`\n`;
      });
    }
    sections.push(md.trim());
  }

  if (data.review.general.length) {
    sections.push(
      `# General Review Notes\n\n${bulletList(
        data.review.general.map((item) => `${item.author}: ${item.body}`)
      )}`
    );
  }

  if (data.checks.pending.length) {
    sections.push(
      `# Pending Checks\n\n${bulletList(data.checks.pending.map((check) => check.name))}`
    );
  }

  const doneLines = [
    '# Definition of Done',
    '',
    'The pull request is complete only when all required checks and review feedback are resolved.',
    '',
    'Before finishing, verify locally:',
    '',
    '```bash',
    ...verifyCommands,
    '```',
  ];

  if (additionalVerifyCommands.length) {
    doneLines.push(
      '',
      'If the PR touches additional subsystems, also verify locally:',
      '',
      '```bash',
      ...additionalVerifyCommands,
      '```'
    );
  }

  doneLines.push(
    '',
    config.pr.finalInstruction ??
      'Finally: generate the Conventional Commit message for the changes.'
  );
  sections.push(doneLines.join('\n'));

  if (data.diff) {
    sections.push(`# Pull Request Diff\n\n\`\`\`diff\n${data.diff}\n\`\`\``);
  }

  return sections.join('\n\n---\n\n').trim() + '\n';
}

export async function runPrAgentCli({ argv = process.argv.slice(2), cwd = process.cwd() } = {}) {
  const options = parseArgs(argv);
  const config = await loadDevxConfig({ cwd });
  const debug = process.env.DEBUG_PR_AGENT === '1' || options.debug;
  const prConfig = config.pr ?? {};
  const outputFile =
    prConfig.agentOutputFileAbsolute ?? path.join(config.repoRoot, '.pr-agent-prompt.md');
  const workflowName = prConfig.ciWorkflowName ?? 'CI PR Checks';
  const coverageArtifactName = prConfig.coverageArtifactName ?? 'coverage-reports';
  const maxDiffChars = prConfig.maxDiffChars ?? DEFAULT_MAX_DIFF_CHARS;
  const normalizedLogTerms = (prConfig.logTerms ?? DEFAULT_LOG_TERMS).map((term) =>
    String(term).toLowerCase()
  );

  console.log(`Generating agent prompt for PR #${options.prNumber}`);

  const repoInfo = getRepoInfo(debug);
  const prData = {
    ...getPRData(options.prNumber, debug),
    repoRoot: config.repoRoot,
  };
  const warnings = [];
  const checkAnalysis = analyzeChecks(prData.checks);
  const discussionReviewItems = collectDiscussionReviewItems(prData.comments, prData.reviews, {
    copilotOnly: options.copilotOnly,
  });
  const reviewThreadData = fetchReviewThreads(repoInfo, Number(options.prNumber), debug);
  warnings.push(...reviewThreadData.warnings);
  const inlineReviewTasks = buildInlineReviewTasks(reviewThreadData.threads, {
    copilotOnly: options.copilotOnly,
  });
  const ciData = collectCITasks(prData, checkAnalysis, debug, workflowName, normalizedLogTerms);
  warnings.push(...ciData.warnings);
  const coverageData = collectCoverageTasks(prData, debug, coverageArtifactName, {
    preferredRunId: ciData.run?.databaseId || null,
    includeCoverage: options.includeCoverage,
    hasCoverageFailures: checkAnalysis.coverageFailures.length > 0,
  });
  warnings.push(...coverageData.warnings);
  const diffData = getDiff(options.prNumber, debug, maxDiffChars);
  warnings.push(...diffData.warnings);

  const prompt = buildPrompt(
    {
      pr: options.prNumber,
      title: prData.title,
      files: prData.files,
      diff: diffData.diff,
      warnings: uniqueBy(warnings, (warning) => warning),
      checks: checkAnalysis,
      ci: ciData,
      coverage: coverageData,
      review: {
        inline: inlineReviewTasks,
        inlineByFile: groupReviewTasksByFile(inlineReviewTasks),
        general: discussionReviewItems,
      },
    },
    config
  );

  fs.writeFileSync(outputFile, prompt);
  maybeOpenInVSCode(outputFile);

  console.log(`
Agent prompt generated: ${path.relative(config.repoRoot, outputFile) || outputFile}

CI failure tasks: ${ciData.tasks.length}
Coverage tasks: ${coverageData.tasks.length}
Inline review tasks: ${inlineReviewTasks.length}
General review notes: ${discussionReviewItems.length}
Pending checks: ${checkAnalysis.pending.length}
Files changed: ${prData.files.length}
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
  await runPrAgentCli();
}
