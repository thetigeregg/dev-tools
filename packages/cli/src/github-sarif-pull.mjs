#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadDevxConfig } from './config.mjs';

const GH_MAX_BUFFER_BYTES = 1024 * 1024 * 50;
const DEFAULT_OUTPUT_DIR = path.join('artifacts', 'sarif');
const DEFAULT_CATEGORY = 'uncategorized';

function printUsage() {
  console.error(
    'Usage: devx github sarif pull [--repo owner/name] [--out-dir <path>] [--ref <ref>] [--category <value>] [--limit <n>] [--force] [--dry-run] [--debug]'
  );
}

export function parseGithubSarifPullArgs(args) {
  const options = {
    repo: null,
    outDir: null,
    ref: null,
    category: null,
    limit: null,
    force: false,
    dryRun: false,
    debug: false,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--debug') {
      options.debug = true;
      continue;
    }

    if (arg === '--repo' || arg === '--out-dir' || arg === '--ref' || arg === '--category') {
      const nextValue = args[index + 1];
      if (!nextValue || nextValue.startsWith('--')) {
        printUsage();
        process.exit(1);
      }

      if (arg === '--repo') options.repo = nextValue;
      if (arg === '--out-dir') options.outDir = nextValue;
      if (arg === '--ref') options.ref = nextValue;
      if (arg === '--category') options.category = nextValue;
      index++;
      continue;
    }

    if (arg === '--limit') {
      const nextValue = args[index + 1];
      const parsedLimit = Number.parseInt(nextValue || '', 10);
      if (!nextValue || Number.isNaN(parsedLimit) || parsedLimit <= 0) {
        printUsage();
        process.exit(1);
      }
      options.limit = parsedLimit;
      index++;
      continue;
    }

    printUsage();
    process.exit(1);
  }

  return options;
}

function runGh(
  args,
  debug,
  { allowFailure = false, cwd = undefined, encoding = 'utf8', execFile = execFileSync } = {}
) {
  if (debug) {
    console.log('[debug]', 'gh', args.join(' '));
  }

  try {
    return execFile('gh', args, {
      cwd,
      encoding,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: GH_MAX_BUFFER_BYTES,
    });
  } catch (error) {
    const command = `gh ${args.join(' ')}`;

    if (allowFailure) {
      if (debug) {
        console.log('[debug]', 'Command failed (allowed):', command);
      }
      return null;
    }

    console.error('GitHub CLI command failed:', command);
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    process.exit(typeof error.status === 'number' ? error.status : 1);
  }
}

function parseGhApiResponse(result) {
  const separator = '\r\n\r\n';
  const fallbackSeparator = '\n\n';
  const separatorIndex = result.indexOf(separator);
  if (separatorIndex !== -1) {
    return {
      headers: result.slice(0, separatorIndex),
      body: result.slice(separatorIndex + separator.length),
    };
  }

  const fallbackIndex = result.indexOf(fallbackSeparator);
  if (fallbackIndex !== -1) {
    return {
      headers: result.slice(0, fallbackIndex),
      body: result.slice(fallbackIndex + fallbackSeparator.length),
    };
  }

  return { headers: '', body: result };
}

function getNextLink(headers) {
  const linkHeaderLine = headers
    .split(/\r?\n/)
    .find((line) => line.toLowerCase().startsWith('link:'));

  if (!linkHeaderLine) {
    return null;
  }

  const match = linkHeaderLine.match(/<([^>]+)>;\s*rel="next"/i);
  return match ? match[1] : null;
}

function normalizeNextEndpoint(nextLink) {
  if (!nextLink) {
    return null;
  }

  if (/^https?:\/\//i.test(nextLink)) {
    const url = new URL(nextLink);
    return `${url.pathname.replace(/^\/+/, '')}${url.search}`;
  }

  return nextLink.replace(/^\/+/, '');
}

export function flattenAnalysisPages(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.flatMap((page) => (Array.isArray(page) ? page : []));
}

function sanitizeFilenameSegment(value, { stripHeadsPrefix = false, fallback = 'unknown' } = {}) {
  let normalized = String(value || '');

  if (stripHeadsPrefix) {
    normalized = normalized.replace(/^refs\/heads\//, '');
  }

  normalized = normalized
    .replace(/[:/\\]+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

export function buildSarifFilename(analysis) {
  const createdAt = sanitizeFilenameSegment(analysis.created_at, { fallback: 'unknown-created' });
  const ref = sanitizeFilenameSegment(analysis.ref, {
    stripHeadsPrefix: true,
    fallback: 'unknown-ref',
  });
  const category = sanitizeFilenameSegment(analysis.category, {
    fallback: DEFAULT_CATEGORY,
  });

  return `sarif-${createdAt}-${ref}-${category}-${analysis.id}.sarif`;
}

export function filterAnalyses(analyses, { ref = null, category = null, limit = null } = {}) {
  const sorted = [...analyses].sort((left, right) => {
    return String(right.created_at || '').localeCompare(String(left.created_at || ''));
  });

  const filtered = sorted.filter((analysis) => {
    if (ref && analysis.ref !== ref) {
      return false;
    }
    if (category && analysis.category !== category) {
      return false;
    }
    return true;
  });

  if (limit == null) {
    return filtered;
  }

  return filtered.slice(0, limit);
}

function analysisMatchesFilters(analysis, { ref = null, category = null } = {}) {
  if (ref && analysis.ref !== ref) {
    return false;
  }
  if (category && analysis.category !== category) {
    return false;
  }
  return true;
}

export function collectDownloadedAnalysisIds(fileNames) {
  const downloadedIds = new Set();

  for (const fileName of fileNames) {
    const match = /-(\d+)\.sarif$/i.exec(fileName);
    if (match) {
      downloadedIds.add(match[1]);
    }
  }

  return downloadedIds;
}

export function resolveSarifRepo({ cliRepo = null, configRepo = null, detectedRepo = null } = {}) {
  return cliRepo || configRepo || detectedRepo || null;
}

export function resolveSarifOutputDir({
  repoRoot,
  cliOutDir = null,
  configOutDirAbsolute = null,
} = {}) {
  if (cliOutDir) {
    return path.isAbsolute(cliOutDir) ? cliOutDir : path.resolve(repoRoot, cliOutDir);
  }

  if (configOutDirAbsolute) {
    return configOutDirAbsolute;
  }

  return path.join(repoRoot, DEFAULT_OUTPUT_DIR);
}

function detectRepoFromGh(debug, execFile, cwd) {
  const result = runGh(['repo', 'view', '--json', 'nameWithOwner'], debug, {
    allowFailure: true,
    cwd,
    execFile,
  });
  if (!result) {
    return null;
  }

  const parsed = JSON.parse(result);
  return parsed.nameWithOwner || null;
}

function fetchAnalyses(
  repo,
  { ref = null, category = null, limit = null } = {},
  debug,
  execFile,
  cwd
) {
  const matchedAnalyses = [];
  let endpoint = `repos/${repo}/code-scanning/analyses?per_page=100`;

  while (endpoint) {
    const result = runGh(['api', '--include', endpoint], debug, { cwd, execFile });
    const { headers, body } = parseGhApiResponse(result);
    const pageAnalyses = JSON.parse(body);

    for (const analysis of Array.isArray(pageAnalyses) ? pageAnalyses : []) {
      if (analysisMatchesFilters(analysis, { ref, category })) {
        matchedAnalyses.push(analysis);
      }
    }

    if (limit != null && matchedAnalyses.length >= limit) {
      break;
    }

    endpoint = normalizeNextEndpoint(getNextLink(headers));
  }

  return filterAnalyses(matchedAnalyses, { limit });
}

function downloadSarif(repo, analysisId, debug, execFile, cwd) {
  return runGh(
    [
      'api',
      '-H',
      'Accept: application/sarif+json',
      `repos/${repo}/code-scanning/analyses/${analysisId}`,
    ],
    debug,
    { cwd, encoding: 'buffer', execFile }
  );
}

export async function runGithubSarifPullCli({
  argv = [],
  cwd = process.cwd(),
  execFile = execFileSync,
  fsModule = fs,
} = {}) {
  const options = parseGithubSarifPullArgs(argv);
  const config = await loadDevxConfig({ cwd });
  const hasExplicitRepo = Boolean(options.repo ?? config.github.repo);
  const repoCwd = config.repoRoot;
  const detectedRepo = hasExplicitRepo ? null : detectRepoFromGh(options.debug, execFile, repoCwd);

  const repo = resolveSarifRepo({
    cliRepo: options.repo,
    configRepo: config.github.repo,
    detectedRepo,
  });

  if (!repo) {
    console.error(
      'Unable to resolve a GitHub repository. Pass --repo owner/name or set github.repo.'
    );
    process.exit(1);
  }

  const outDir = resolveSarifOutputDir({
    repoRoot: config.repoRoot,
    cliOutDir: options.outDir,
    configOutDirAbsolute: config.github.sarifOutputDirAbsolute,
  });

  const outDirExists = fsModule.existsSync(outDir);
  if (outDirExists && !fsModule.statSync(outDir).isDirectory()) {
    console.error(`Output path exists but is not a directory: ${outDir}`);
    process.exit(1);
  }

  const analyses = fetchAnalyses(
    repo,
    {
      ref: options.ref,
      category: options.category,
      limit: options.limit ?? config.github.sarifPullLimit ?? null,
    },
    options.debug,
    execFile,
    repoCwd
  );

  if (!analyses.length) {
    console.log(`No SARIF analyses found for ${repo}.`);
    return {
      repo,
      outDir,
      analyses: [],
      downloads: [],
      downloadedCount: 0,
      plannedCount: 0,
      dryRun: options.dryRun,
      skippedCount: 0,
    };
  }

  let downloadedIds = new Set();
  if (outDirExists) {
    downloadedIds = collectDownloadedAnalysisIds(fsModule.readdirSync(outDir));
  }

  if (!options.dryRun) {
    fsModule.mkdirSync(outDir, { recursive: true });
  }

  const downloads = [];
  let skippedCount = 0;

  for (const analysis of analyses) {
    const analysisId = String(analysis.id);
    const filePath = path.join(outDir, buildSarifFilename(analysis));
    const alreadyDownloaded = downloadedIds.has(analysisId);

    if (alreadyDownloaded && !options.force) {
      console.log(`Skipping ${analysisId} (already downloaded)`);
      skippedCount++;
      continue;
    }

    downloads.push({
      id: analysisId,
      filePath,
      createdAt: analysis.created_at || null,
      ref: analysis.ref || null,
      category: analysis.category || null,
    });

    if (options.dryRun) {
      console.log(`[dry-run] Would download ${analysisId} -> ${filePath}`);
      continue;
    }

    console.log(`Downloading SARIF for analysis ${analysisId} -> ${filePath}`);
    const sarifPayload = downloadSarif(repo, analysisId, options.debug, execFile, repoCwd);
    fsModule.writeFileSync(filePath, sarifPayload);
    downloadedIds.add(analysisId);
  }

  if (options.dryRun) {
    console.log(
      `Dry run complete. ${downloads.length} analyses would be downloaded to ${outDir}. ${skippedCount} already present.`
    );
  } else {
    console.log(`Done. Downloaded ${downloads.length} SARIF file(s) to ${outDir}.`);
  }

  return {
    repo,
    outDir,
    analyses,
    downloads,
    downloadedCount: options.dryRun ? 0 : downloads.length,
    plannedCount: downloads.length,
    dryRun: options.dryRun,
    skippedCount,
  };
}

export function isEntrypoint({ argv1 = process.argv[1], moduleUrl = import.meta.url } = {}) {
  if (!argv1) {
    return false;
  }

  return pathToFileURL(path.resolve(argv1)).href === moduleUrl;
}

if (isEntrypoint()) {
  await runGithubSarifPullCli({ argv: process.argv.slice(2) });
}
