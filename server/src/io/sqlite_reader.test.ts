import { expect, test } from 'vitest';

import { assertUnchanged, type Fingerprint } from './sqlite_reader.ts';

const fp = (name: string, mtimeMs: number, size: number): Fingerprint =>
  ({ name, path: `/x/${name}`, mtimeMs, size });

test('identical fingerprints pass silently', () => {
  const before = [fp('mcp-index.db', 1000, 500)];
  expect(() => { assertUnchanged(before, before); }).not.toThrow();
});

test('a changed mtime is a torn read — refused, and the source is named', () => {
  const before = [fp('dating.db', 1000, 500)];
  const after = [fp('dating.db', 2000, 500)];
  expect(() => { assertUnchanged(before, after); }).toThrow(/dating\.db/);
});

test('a changed size is refused too, even with the same mtime', () => {
  const before = [fp('dating.db', 1000, 500)];
  const after = [fp('dating.db', 1000, 600)];
  expect(() => { assertUnchanged(before, after); }).toThrow(/dating\.db/);
});

test('a source that disappeared entirely between the two probes is refused', () => {
  const before = [fp('dating.db', 1000, 500)];
  expect(() => { assertUnchanged(before, []); }).toThrow(/dating\.db/);
});

test('an unrelated source appearing in "after" does not by itself trip the check', () => {
  const before = [fp('dating.db', 1000, 500)];
  const after = [fp('dating.db', 1000, 500), fp('mcp-content.db', 1, 1)];
  expect(() => { assertUnchanged(before, after); }).not.toThrow();
});
