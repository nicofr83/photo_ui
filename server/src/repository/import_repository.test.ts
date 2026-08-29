import { describe, expect, test } from 'vitest';

import { formatTextArray } from './import_repository.ts';

describe('formatTextArray — a Postgres array literal, for a text[] COPY column', () => {
  test('an empty array is the empty literal, not NULL', () => {
    expect(formatTextArray([])).toBe('{}');
  });

  test('plain values need no quoting', () => {
    expect(formatTextArray(['a', 'b'])).toBe('{a,b}');
  });

  test('a value containing a comma or brace is double-quoted', () => {
    expect(formatTextArray(['a,b', 'c}'])).toBe('{"a,b","c}"}');
  });

  test('an embedded double quote or backslash is escaped', () => {
    expect(formatTextArray(['say "hi"', 'back\\slash'])).toBe('{"say \\"hi\\"","back\\\\slash"}');
  });

  test('an id containing a slash — the real evidenceEntryIds shape — needs no quoting', () => {
    expect(formatTextArray(['logbook/p003/019', 'logbook/p004/003']))
      .toBe('{logbook/p003/019,logbook/p004/003}');
  });
});
