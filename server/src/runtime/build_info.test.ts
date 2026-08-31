import { expect, test } from 'vitest';

import { getCommitInfo } from './build_info.ts';

test('returns the real HEAD sha and a boolean dirty flag, against the actual repo', () => {
  const info = getCommitInfo();
  expect(info?.sha).toMatch(/^[0-9a-f]{40}$/);
  expect(typeof info?.dirty).toBe('boolean');
});

test('returns null when git is unavailable — never throws, never blocks startup', () => {
  const failing = (): string => { throw new Error('git not found'); };
  expect(getCommitInfo(failing)).toBeNull();
});

test('dirty is true when the working tree has changes, false when it does not', () => {
  const clean = (args: readonly string[]): string => (args[0] === 'status' ? '' : 'a'.repeat(40));
  expect(getCommitInfo(clean)?.dirty).toBe(false);

  const withChanges = (args: readonly string[]): string => (args[0] === 'status' ? ' M some/file.ts\n' : 'a'.repeat(40));
  expect(getCommitInfo(withChanges)?.dirty).toBe(true);
});
