#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { pathToFileURL } from 'node:url';

import { loadDevxConfig } from './config.mjs';
import { expandUserPath } from './worktree-runtime.mjs';

function normalizeContent(content) {
  return content.replace(/\r\n/g, '\n');
}

function formatTimestampForFilename(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function parseEnvEntries(content, options = {}) {
  const includeCommentedAssignments = Boolean(options.includeCommentedAssignments);
  const lines = normalizeContent(content).split('\n');
  const assignmentRegex = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
  const entries = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith('#')) {
      if (!includeCommentedAssignments) {
        continue;
      }
      const uncommented = trimmed.replace(/^#\s*/, '');
      const commentedMatch = assignmentRegex.exec(uncommented);
      if (!commentedMatch) {
        continue;
      }
      entries.push({
        key: commentedMatch[1],
        value: commentedMatch[2],
      });
      continue;
    }
    const match = assignmentRegex.exec(line);
    if (!match) {
      continue;
    }
    entries.push({
      key: match[1],
      value: match[2],
    });
  }

  return entries;
}

function toLastEntryMap(entries) {
  const map = new Map();
  for (const entry of entries) {
    map.set(entry.key, entry);
  }
  return map;
}

function toFirstSeenOrderedKeys(entries) {
  const seen = new Set();
  const ordered = [];
  for (const entry of entries) {
    if (seen.has(entry.key)) {
      continue;
    }
    seen.add(entry.key);
    ordered.push(entry.key);
  }
  return ordered;
}

function addAssignmentLine(sharedContent, key, value) {
  const normalized = normalizeContent(sharedContent);
  if (!normalized || normalized.trim().length === 0) {
    return `${key}=${value}\n`;
  }

  const trimmedEnd = normalized.replace(/\s*$/, '');
  return `${trimmedEnd}\n${key}=${value}\n`;
}

function printSummary(exampleMap, allowedExampleMap, sharedMap) {
  const missing = [...exampleMap.keys()].filter((key) => !sharedMap.has(key));
  const extra = [...sharedMap.keys()].filter((key) => !allowedExampleMap.has(key));
  console.log('');
  console.log(`Missing in shared env: ${String(missing.length)}`);
  console.log(`Extra in shared env: ${String(extra.length)}`);
}

async function askChoice(rl) {
  console.log('');
  console.log('Choose an action:');
  console.log('  1) Add missing fields (from .env.example -> shared env)');
  console.log(
    '  2) Save (normalize to .env.example layout, add missing keys using example values, and activate commented keys) and exit'
  );
  console.log('  3) Exit without saving');
  return (await askLine(rl, 'Select [1-3]: ')).trim();
}

function askLine(rl, prompt, prefill = '') {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer));
    if (prefill) {
      rl.write(prefill);
    }
  });
}

async function askYesNo(rl, prompt, defaultYes) {
  const suffix = defaultYes ? ' [Y/n]: ' : ' [y/N]: ';
  const answer = (await askLine(rl, `${prompt}${suffix}`)).trim().toLowerCase();
  if (!answer) {
    return defaultYes;
  }
  return answer === 'y' || answer === 'yes';
}

async function askValue(rl, key, defaultValue) {
  const hasDefault = typeof defaultValue === 'string' && defaultValue.length > 0;
  const promptSuffix = hasDefault ? ' (Enter for default, "-" for empty)' : '';
  const answer = await askLine(rl, `Value for ${key}${promptSuffix}: `, defaultValue);
  if (answer.length === 0 && hasDefault) {
    return defaultValue;
  }
  if (answer === '-' && hasDefault) {
    return '';
  }
  return answer;
}

async function runAddMissingFlow(rl, exampleOrderedKeys, exampleMap, sharedMap, sharedContent) {
  let nextContent = sharedContent;
  let changed = false;
  const missingOrderedKeys = exampleOrderedKeys.filter((key) => !sharedMap.has(key));

  if (missingOrderedKeys.length === 0) {
    console.log('');
    console.log('No missing fields found.');
    return { changed, sharedContent: nextContent };
  }

  console.log('');
  console.log(`Found ${String(missingOrderedKeys.length)} missing field(s).`);
  for (const key of missingOrderedKeys) {
    const exampleEntry = exampleMap.get(key);
    if (!exampleEntry) {
      continue;
    }
    const shouldAdd = await askYesNo(rl, `Add ${key}?`, true);
    if (!shouldAdd) {
      continue;
    }
    const selectedValue = await askValue(rl, key, exampleEntry.value);
    nextContent = addAssignmentLine(nextContent, key, selectedValue);
    sharedMap.set(key, { key, value: selectedValue });
    changed = true;
    console.log(`Added ${key}.`);
  }

  return { changed, sharedContent: nextContent };
}

function rewriteToExampleTemplate(exampleContent, sharedMap) {
  const assignmentRegex = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/;
  const commentedAssignmentRegex = /^(\s*)#\s*([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/;
  const lines = normalizeContent(exampleContent).split('\n');

  return lines
    .map((line) => {
      let match = assignmentRegex.exec(line);
      let isCommentedAssignment = false;
      if (!match) {
        match = commentedAssignmentRegex.exec(line);
        isCommentedAssignment = Boolean(match);
      }

      if (!match) {
        return line;
      }

      const [, indent, key, separator] = match;
      const sharedEntry = sharedMap.get(key);
      if (!sharedEntry) {
        return line;
      }

      const prefix = isCommentedAssignment ? indent : indent;
      return `${prefix}${key}${separator}${sharedEntry.value}`;
    })
    .join('\n')
    .replace(/\s*$/, '\n');
}

export function isEntrypoint({ argv1 = process.argv[1], moduleUrl = import.meta.url } = {}) {
  if (!argv1) {
    return false;
  }

  return pathToFileURL(path.resolve(argv1)).href === moduleUrl;
}

export async function runEnvReconcileCli({ cwd = process.cwd() } = {}) {
  const config = await loadDevxConfig({ cwd });
  const defaultSharedEnvFile =
    config.env.sharedTemplateFile ?? path.join(os.homedir(), '.config', config.projectName, 'worktree.env');
  const sharedEnvFilePath = path.resolve(expandUserPath(process.env.WORKTREE_ENV_FILE?.trim() || defaultSharedEnvFile));
  const examplePath = config.env.exampleFileAbsolute;
  const localPath = config.env.localFileAbsolute;

  if (!examplePath || !localPath) {
    throw new Error('devx.config.mjs must define env.exampleFile and env.localFile for env reconcile');
  }

  console.log('Worktree Env Reconciler');
  console.log(`Example env: ${examplePath}`);
  console.log(`Local env:   ${localPath}`);
  console.log(`Shared env:  ${sharedEnvFilePath}`);

  if (!existsSync(examplePath)) {
    throw new Error(`Example env file not found: ${examplePath}`);
  }

  if (!existsSync(sharedEnvFilePath)) {
    mkdirSync(path.dirname(sharedEnvFilePath), { recursive: true });
    if (existsSync(localPath)) {
      copyFileSync(localPath, sharedEnvFilePath);
      console.log('Created shared env from local env.');
    } else {
      copyFileSync(examplePath, sharedEnvFilePath);
      console.log('Created shared env from example env.');
    }
  }

  const exampleContent = readFileSync(examplePath, 'utf8');
  let sharedContent = readFileSync(sharedEnvFilePath, 'utf8');
  const exampleEntries = parseEnvEntries(exampleContent, { includeCommentedAssignments: true });
  const sharedEntries = parseEnvEntries(sharedContent, { includeCommentedAssignments: true });
  const exampleMap = toLastEntryMap(exampleEntries);
  const allowedExampleMap = toLastEntryMap(exampleEntries);
  const sharedMap = toLastEntryMap(sharedEntries);
  const exampleOrderedKeys = toFirstSeenOrderedKeys(exampleEntries);

  printSummary(exampleMap, allowedExampleMap, sharedMap);

  const rl = readline.createInterface({ input, output });
  let changed = false;

  try {
    while (true) {
      const choice = await askChoice(rl);

      if (choice === '1') {
        const result = await runAddMissingFlow(
          rl,
          exampleOrderedKeys,
          exampleMap,
          sharedMap,
          sharedContent
        );
        sharedContent = result.sharedContent;
        changed = changed || result.changed;
        continue;
      }

      if (choice === '2') {
        const nextContent = rewriteToExampleTemplate(exampleContent, sharedMap);
        const backupPath = `${sharedEnvFilePath}.${formatTimestampForFilename()}.bak`;
        renameSync(sharedEnvFilePath, backupPath);
        writeFileSync(sharedEnvFilePath, nextContent, 'utf8');
        console.log(`Saved shared env. Backup: ${backupPath}`);
        changed = true;
        break;
      }

      if (choice === '3') {
        break;
      }
    }
  } finally {
    rl.close();
  }

  return { changed, sharedEnvFilePath };
}

if (isEntrypoint()) {
  await runEnvReconcileCli();
}
