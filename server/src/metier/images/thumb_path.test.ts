import { expect, test } from 'vitest';

import { thumbPath } from './thumb_path.ts';

test('a sha256 is validated BEFORE any path concatenation', () => {
  for (const evil of ['../../etc/passwd', 'a'.repeat(63), 'A'.repeat(64), '']) {
    expect(() => { thumbPath(evil); }).toThrow();
  }
  expect(() => { thumbPath('a'.repeat(64)); }).not.toThrow();
});

test('builds a flat filename — the real cache and thumb roots are flat, sha256-named', () => {
  expect(thumbPath('a'.repeat(64))).toBe(`${'a'.repeat(64)}.jpg`);
});
