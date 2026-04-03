import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { trimTrailingPathSeparators } from '../src/dev-cleanup.mjs';

test('trimTrailingPathSeparators preserves Windows drive roots', () => {
  assert.equal(trimTrailingPathSeparators('C:/', path.win32), 'C:/');
  assert.equal(trimTrailingPathSeparators('C:\\', path.win32), 'C:\\');
  assert.equal(
    trimTrailingPathSeparators('C:/worktrees/feature///', path.win32),
    'C:/worktrees/feature'
  );
  assert.equal(
    trimTrailingPathSeparators('C:\\worktrees\\feature\\\\\\', path.win32),
    'C:\\worktrees\\feature'
  );
});
