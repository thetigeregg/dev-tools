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
    'sarif-2026-04-04T12-34-56Z-feature-sarif-codeql-javascript-typescript-42.sarif'
  );
});

test('collectDownloadedAnalysisIds extracts ids from existing sarif filenames', () => {
  assert.deepEqual(
    [
      ...collectDownloadedAnalysisIds([
        'sarif-a-b-c-123.sarif',
        'note.txt',
        'sarif-x-y-z-456.sarif',
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
  fs.writeFileSync(path.join(outDir, 'sarif-old-main-cat-100.sarif'), '{}', 'utf8');

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

        if (args[0] === 'api' && args[1] === '--include') {
          return `\n\n${JSON.stringify([
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
          ])}`;
        }

        throw new Error(`Unexpected gh call: ${args.join(' ')}`);
      },
    });

    assert.equal(result.repo, 'config/repo');
    assert.equal(result.outDir, outDir);
    assert.equal(result.downloadedCount, 0);
    assert.equal(result.plannedCount, 1);
    assert.equal(result.dryRun, true);
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
        if (command === 'gh' && args[0] === 'api' && args[1] === '--include') {
          return '\n\n[]';
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
      plannedCount: 0,
      dryRun: false,
      skippedCount: 0,
    });
  } finally {
    console.log = originalConsoleLog;
  }
});

test('runGithubSarifPullCli reports planned downloads separately from actual writes in dry run mode', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devx-github-sarif-dry-run-counts-'));
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
      argv: ['--dry-run'],
      cwd: repoRoot,
      execFile: (command, args) => {
        if (command === 'gh' && args[0] === 'api' && args[1] === '--include') {
          return `\n\n${JSON.stringify([{ id: 201, created_at: '2026-04-04T12:00:00Z', ref: 'refs/heads/main', category: 'cat' }])}`;
        }

        throw new Error(`Unexpected gh call: ${args.join(' ')}`);
      },
    });

    assert.equal(result.downloadedCount, 0);
    assert.equal(result.plannedCount, 1);
    assert.equal(result.dryRun, true);
    assert.equal(result.downloads[0].id, '201');
  } finally {
    console.log = originalConsoleLog;
  }
});

test('runGithubSarifPullCli returns null repo detection failures so guidance can be shown', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devx-github-sarif-detect-fail-'));
  fs.writeFileSync(path.join(repoRoot, 'devx.config.mjs'), 'export default {};\n', 'utf8');

  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  const errors = [];

  console.error = (message) => {
    errors.push(message);
  };
  console.log = () => {};
  const originalExit = process.exit;
  process.exit = (code) => {
    throw new Error(`process.exit:${code}`);
  };

  try {
    await assert.rejects(
      async () =>
        runGithubSarifPullCli({
          argv: [],
          cwd: repoRoot,
          execFile: (command, args) => {
            if (command === 'gh' && args[0] === 'repo' && args[1] === 'view') {
              const error = new Error('gh repo view failed');
              error.status = 1;
              throw error;
            }

            throw new Error(`Unexpected gh call: ${args.join(' ')}`);
          },
        }),
      /process\.exit:1/
    );

    assert.match(
      errors[0],
      /Unable to resolve a GitHub repository\. Pass --repo owner\/name or set github\.repo\./
    );
  } finally {
    process.exit = originalExit;
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
  }
});

test('runGithubSarifPullCli passes repo root as cwd to gh commands', async () => {
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devx-github-sarif-parent-'));
  const repoRoot = path.join(parentDir, 'repo');
  const nestedCwd = path.join(repoRoot, 'packages', 'cli');
  fs.mkdirSync(nestedCwd, { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'devx.config.mjs'), 'export default {};\n', 'utf8');

  const originalConsoleLog = console.log;
  console.log = () => {};
  const ghOptions = [];

  try {
    const result = await runGithubSarifPullCli({
      argv: [],
      cwd: nestedCwd,
      execFile: (command, args, options) => {
        ghOptions.push({ command, args, cwd: options?.cwd, encoding: options?.encoding });

        if (command === 'gh' && args[0] === 'repo' && args[1] === 'view') {
          return JSON.stringify({ nameWithOwner: 'detected/repo' });
        }
        if (command === 'gh' && args[0] === 'api' && args[1] === '--include') {
          return `\n\n${JSON.stringify([{ id: 401, created_at: '2026-04-04T12:00:00Z', ref: 'refs/heads/main', category: 'codeql/js' }])}`;
        }

        throw new Error(`Unexpected gh call: ${args.join(' ')}`);
      },
      downloadSarif: (_repo, _analysisId, filePath) => {
        fs.writeFileSync(filePath, '{"runs":[]}', 'utf8');
      },
    });

    assert.equal(result.repo, 'detected/repo');
    assert.equal(ghOptions.length, 2);
    assert.ok(ghOptions.every((call) => call.cwd === repoRoot));
  } finally {
    console.log = originalConsoleLog;
  }
});

test('runGithubSarifPullCli does not detect repo when cli repo is provided', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devx-github-sarif-cli-repo-'));
  fs.writeFileSync(path.join(repoRoot, 'devx.config.mjs'), 'export default {};\n', 'utf8');

  const originalConsoleLog = console.log;
  console.log = () => {};

  try {
    const result = await runGithubSarifPullCli({
      argv: ['--repo', 'cli/repo'],
      cwd: repoRoot,
      execFile: (command, args) => {
        if (args[0] === 'repo' && args[1] === 'view') {
          throw new Error('repo detection should not run when --repo is provided');
        }
        if (command === 'gh' && args[0] === 'api' && args[1] === '--include') {
          return '\n\n[]';
        }

        throw new Error(`Unexpected gh call: ${args.join(' ')}`);
      },
    });

    assert.equal(result.repo, 'cli/repo');
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
        if (args[0] === 'api' && args[1] === '--include') {
          return `\n\n${JSON.stringify([{ id: 301, created_at: '2026-04-04T12:00:00Z', ref: 'refs/heads/main', category: 'codeql/js' }])}`;
        }

        throw new Error(`Unexpected gh call: ${args.join(' ')}`);
      },
      downloadSarif: (_repo, _analysisId, filePath) => {
        fs.writeFileSync(filePath, '{"runs":[]}', 'utf8');
      },
    });
    const writtenFile = path.join(
      repoRoot,
      'artifacts',
      'sarif',
      'sarif-2026-04-04T12-00-00Z-main-codeql-js-301.sarif'
    );

    assert.equal(result.repo, 'detected/repo');
    assert.equal(result.downloadedCount, 1);
    assert.equal(result.plannedCount, 1);
    assert.equal(result.dryRun, false);
    assert.equal(fs.readFileSync(writtenFile, 'utf8'), '{"runs":[]}');
  } finally {
    console.log = originalConsoleLog;
  }
});

test('runGithubSarifPullCli stops fetching analysis pages once the requested limit is satisfied', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devx-github-sarif-limit-'));
  fs.writeFileSync(path.join(repoRoot, 'devx.config.mjs'), 'export default {};\n', 'utf8');

  const originalConsoleLog = console.log;
  console.log = () => {};
  const endpoints = [];

  try {
    const result = await runGithubSarifPullCli({
      argv: ['--repo', 'cli/repo', '--dry-run', '--limit', '1'],
      cwd: repoRoot,
      execFile: (command, args) => {
        if (command === 'gh' && args[0] === 'api' && args[1] === '--include') {
          endpoints.push(args[2]);
          if (args[2] === 'repos/cli/repo/code-scanning/analyses?per_page=100') {
            return `link: <https://api.github.com/repos/cli/repo/code-scanning/analyses?page=2>; rel="next"\n\n${JSON.stringify([{ id: 501, created_at: '2026-04-04T12:00:00Z', ref: 'refs/heads/main', category: 'cat' }])}`;
          }

          throw new Error(`Unexpected extra page fetch: ${args[2]}`);
        }

        throw new Error(`Unexpected gh call: ${args.join(' ')}`);
      },
    });

    assert.equal(result.plannedCount, 1);
    assert.deepEqual(endpoints, ['repos/cli/repo/code-scanning/analyses?per_page=100']);
  } finally {
    console.log = originalConsoleLog;
  }
});

test('runGithubSarifPullCli exits with a clear error when out-dir points to a file', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devx-github-sarif-out-file-'));
  const outFile = path.join(repoRoot, 'sarif-output');
  fs.writeFileSync(path.join(repoRoot, 'devx.config.mjs'), 'export default {};\n', 'utf8');
  fs.writeFileSync(outFile, 'not a directory', 'utf8');

  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  const originalExit = process.exit;
  const errors = [];

  console.error = (message) => {
    errors.push(message);
  };
  console.log = () => {};
  process.exit = (code) => {
    throw new Error(`process.exit:${code}`);
  };

  try {
    await assert.rejects(
      async () =>
        runGithubSarifPullCli({
          argv: ['--repo', 'cli/repo', '--out-dir', outFile],
          cwd: repoRoot,
          execFile: () => {
            throw new Error('analysis fetch should not run when output path is invalid');
          },
        }),
      /process\.exit:1/
    );

    assert.match(errors[0], /Output path exists but is not a directory:/);
  } finally {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    process.exit = originalExit;
  }
});

test('runGithubSarifPullCli streams SARIF downloads to gh output files', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devx-github-sarif-gh-output-'));
  fs.writeFileSync(path.join(repoRoot, 'devx.config.mjs'), 'export default {};\n', 'utf8');

  const originalConsoleLog = console.log;
  console.log = () => {};
  const ghCalls = [];

  try {
    await runGithubSarifPullCli({
      argv: [],
      cwd: repoRoot,
      execFile: (command, args, options) => {
        ghCalls.push({ command, args, options });

        if (args[0] === 'repo' && args[1] === 'view') {
          return JSON.stringify({ nameWithOwner: 'detected/repo' });
        }
        if (args[0] === 'api' && args[1] === '--include') {
          return `\n\n${JSON.stringify([{ id: 601, created_at: '2026-04-04T12:00:00Z', ref: 'refs/heads/main', category: 'cat' }])}`;
        }
        if (args[0] === 'api' && args.includes('--output')) {
          const outputIndex = args.indexOf('--output');
          fs.writeFileSync(args[outputIndex + 1], '{"runs":[]}', 'utf8');
          return '';
        }

        throw new Error(`Unexpected gh call: ${args.join(' ')}`);
      },
    });

    const downloadCall = ghCalls.find((call) => call.args.includes('--output'));
    assert.ok(downloadCall);
    assert.equal(downloadCall.options?.encoding, 'utf8');
    assert.equal(
      downloadCall.args[downloadCall.args.indexOf('--output') + 1],
      path.join(repoRoot, 'artifacts', 'sarif', 'sarif-2026-04-04T12-00-00Z-main-cat-601.sarif')
    );
  } finally {
    console.log = originalConsoleLog;
  }
});
