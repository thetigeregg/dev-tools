import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildSarifFilename,
  collectDownloadedAnalysisIds,
  filterAnalyses,
  flattenAnalysisPages,
  parseGithubSarifPullArgs,
  resolveSarifOutputDir,
  resolveSarifRepo,
  runGithubSarifPullCli,
} from '../src/github-sarif-pull.mjs';

test('parseGithubSarifPullArgs accepts supported flags', () => {
  assert.deepEqual(
    parseGithubSarifPullArgs([
      '--repo',
      'thetigeregg/dev-tools',
      '--out-dir',
      'tmp/sarif',
      '--ref',
      'refs/heads/main',
      '--category',
      'codeql/javascript',
      '--limit',
      '5',
      '--force',
      '--dry-run',
      '--debug',
    ]),
    {
      repo: 'thetigeregg/dev-tools',
      outDir: 'tmp/sarif',
      ref: 'refs/heads/main',
      category: 'codeql/javascript',
      limit: 5,
      force: true,
      dryRun: true,
      debug: true,
    }
  );
});

test('parseGithubSarifPullArgs rejects invalid limit values with usage output', () => {
  const originalExit = process.exit;
  const originalConsoleError = console.error;
  const messages = [];

  process.exit = (code) => {
    throw new Error(`process.exit:${code}`);
  };
  console.error = (message) => {
    messages.push(message);
  };

  try {
    assert.throws(() => parseGithubSarifPullArgs(['--limit', '0']), /process\.exit:1/);
    assert.match(messages[0], /Usage: devx github sarif pull/);
  } finally {
    process.exit = originalExit;
    console.error = originalConsoleError;
  }
});

test('flattenAnalysisPages merges paginated gh api arrays', () => {
  assert.deepEqual(flattenAnalysisPages([[{ id: 1 }, { id: 2 }], [{ id: 3 }], { not: 'a-page' }]), [
    { id: 1 },
    { id: 2 },
    { id: 3 },
  ]);
});

test('filterAnalyses sorts newest first and applies ref, category, and limit filters', () => {
  const result = filterAnalyses(
    [
      { id: 1, created_at: '2025-01-01T00:00:00Z', ref: 'refs/heads/main', category: 'a' },
      { id: 2, created_at: '2025-01-03T00:00:00Z', ref: 'refs/heads/main', category: 'b' },
      { id: 3, created_at: '2025-01-02T00:00:00Z', ref: 'refs/heads/dev', category: 'b' },
    ],
    { ref: 'refs/heads/main', category: 'b', limit: 1 }
  );

  assert.deepEqual(result, [
    { id: 2, created_at: '2025-01-03T00:00:00Z', ref: 'refs/heads/main', category: 'b' },
  ]);
});

test('buildSarifFilename sanitizes timestamp, ref, and category segments', () => {
  assert.equal(
    buildSarifFilename({
      id: 42,
      created_at: '2026-04-04T12:34:56Z',
      ref: 'refs/heads/feature/sarif',
      category: 'codeql/javascript-typescript',
    }),
    'codeql-2026-04-04T12-34-56Z-feature-sarif-codeql-javascript-typescript-42.sarif'
  );
});

test('collectDownloadedAnalysisIds extracts ids from existing sarif filenames', () => {
  assert.deepEqual(
    [
      ...collectDownloadedAnalysisIds([
        'codeql-a-b-c-123.sarif',
        'note.txt',
        'codeql-x-y-z-456.sarif',
      ]),
    ],
    ['123', '456']
  );
});

test('resolveSarifRepo prefers cli over config over detected repo', () => {
  assert.equal(
    resolveSarifRepo({
      cliRepo: 'cli/repo',
      configRepo: 'config/repo',
      detectedRepo: 'detected/repo',
    }),
    'cli/repo'
  );
  assert.equal(
    resolveSarifRepo({
      configRepo: 'config/repo',
      detectedRepo: 'detected/repo',
    }),
    'config/repo'
  );
  assert.equal(resolveSarifRepo({ detectedRepo: 'detected/repo' }), 'detected/repo');
});

test('resolveSarifOutputDir prefers cli path then config absolute path then default', () => {
  assert.equal(
    resolveSarifOutputDir({
      repoRoot: '/repo',
      cliOutDir: 'tmp/sarif',
      configOutDirAbsolute: '/repo/from-config',
    }),
    path.resolve('/repo', 'tmp/sarif')
  );
  assert.equal(
    resolveSarifOutputDir({
      repoRoot: '/repo',
      configOutDirAbsolute: '/repo/from-config',
    }),
    '/repo/from-config'
  );
  assert.equal(
    resolveSarifOutputDir({
      repoRoot: '/repo',
    }),
    path.join('/repo', 'artifacts', 'sarif')
  );
});

test('runGithubSarifPullCli dry run resolves repo, applies filters, and skips existing ids', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devx-github-sarif-'));
  const outDir = path.join(repoRoot, 'existing-sarif');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, 'devx.config.mjs'),
    `export default {
      github: {
        repo: 'config/repo',
        sarifOutputDir: 'existing-sarif',
        sarifPullLimit: 3
      }
    };
    `,
    'utf8'
  );
  fs.writeFileSync(path.join(outDir, 'codeql-old-main-cat-100.sarif'), '{}', 'utf8');

  const execCalls = [];
  const originalConsoleLog = console.log;
  const logs = [];

  console.log = (message) => {
    logs.push(message);
  };

  try {
    const result = await runGithubSarifPullCli({
      argv: ['--dry-run', '--ref', 'refs/heads/main', '--category', 'cat'],
      cwd: repoRoot,
      execFile: (command, args, options) => {
        execCalls.push([command, args, options?.encoding ?? 'utf8']);

        if (args[0] === 'api' && args.includes('--paginate')) {
          return JSON.stringify([
            [
              {
                id: 100,
                created_at: '2026-04-04T12:00:00Z',
                ref: 'refs/heads/main',
                category: 'cat',
              },
              {
                id: 101,
                created_at: '2026-04-04T11:00:00Z',
                ref: 'refs/heads/main',
                category: 'cat',
              },
            ],
          ]);
        }

        throw new Error(`Unexpected gh call: ${args.join(' ')}`);
      },
    });

    assert.equal(result.repo, 'config/repo');
    assert.equal(result.outDir, outDir);
    assert.equal(result.downloadedCount, 1);
    assert.equal(result.skippedCount, 1);
    assert.equal(result.downloads[0].id, '101');
    assert.equal(execCalls.length, 1);
    assert.ok(logs.some((line) => line.includes('Skipping 100')));
    assert.ok(logs.some((line) => line.includes('[dry-run] Would download 101')));
  } finally {
    console.log = originalConsoleLog;
  }
});

test('runGithubSarifPullCli returns an empty downloads array when no analyses match', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devx-github-sarif-empty-'));
  fs.writeFileSync(
    path.join(repoRoot, 'devx.config.mjs'),
    `export default {
      github: {
        repo: 'config/repo'
      }
    };
    `,
    'utf8'
  );

  const originalConsoleLog = console.log;
  console.log = () => {};

  try {
    const result = await runGithubSarifPullCli({
      argv: [],
      cwd: repoRoot,
      execFile: (command, args) => {
        if (command === 'gh' && args[0] === 'api' && args.includes('--paginate')) {
          return JSON.stringify([[]]);
        }

        throw new Error(`Unexpected gh call: ${args.join(' ')}`);
      },
    });

    assert.deepEqual(result, {
      repo: 'config/repo',
      outDir: path.join(repoRoot, 'artifacts', 'sarif'),
      analyses: [],
      downloads: [],
      downloadedCount: 0,
      skippedCount: 0,
    });
  } finally {
    console.log = originalConsoleLog;
  }
});

test('runGithubSarifPullCli writes sarif files and falls back to gh repo view', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devx-github-sarif-write-'));
  fs.writeFileSync(path.join(repoRoot, 'devx.config.mjs'), 'export default {};\n', 'utf8');

  const originalConsoleLog = console.log;
  console.log = () => {};

  try {
    const result = await runGithubSarifPullCli({
      argv: [],
      cwd: repoRoot,
      execFile: (command, args) => {
        if (args[0] === 'repo' && args[1] === 'view') {
          return JSON.stringify({ nameWithOwner: 'detected/repo' });
        }
        if (args[0] === 'api' && args.includes('--paginate')) {
          return JSON.stringify([
            [
              {
                id: 301,
                created_at: '2026-04-04T12:00:00Z',
                ref: 'refs/heads/main',
                category: 'codeql/js',
              },
            ],
          ]);
        }
        if (args[0] === 'api' && String(args.at(-1)).endsWith('/301')) {
          return Buffer.from('{"runs":[]}');
        }

        throw new Error(`Unexpected gh call: ${args.join(' ')}`);
      },
    });
    const writtenFile = path.join(
      repoRoot,
      'artifacts',
      'sarif',
      'codeql-2026-04-04T12-00-00Z-main-codeql-js-301.sarif'
    );

    assert.equal(result.repo, 'detected/repo');
    assert.equal(result.downloadedCount, 1);
    assert.equal(fs.readFileSync(writtenFile, 'utf8'), '{"runs":[]}');
  } finally {
    console.log = originalConsoleLog;
  }
});
