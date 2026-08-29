import { describe, expect, test } from 'vitest';

import { cleanSearchQuery } from './clean_query.ts';

describe('cleanSearchQuery', () => {
  test('an ordinary query passes through, trimmed', () => {
    expect(cleanSearchQuery('  Tikal ruines  ')).toBe('Tikal ruines');
  });

  test('the NUL byte is stripped FIRST — it would otherwise truncate the query mid-literal', () => {
    const withNul = `Tikal${String.fromCharCode(0)}ruines`;
    expect(cleanSearchQuery(withNul)).toBe('Tikalruines');
  });

  test('other control characters are stripped too', () => {
    const withControls = `Tikal${String.fromCharCode(1)}${String.fromCharCode(27)}ruines`;
    expect(cleanSearchQuery(withControls)).toBe('Tikalruines');
  });

  test('a query that is control characters ONLY falls back to null — never the whole library', () => {
    expect(cleanSearchQuery(String.fromCharCode(0))).toBeNull();
  });

  test('an empty or whitespace-only query is null', () => {
    expect(cleanSearchQuery('')).toBeNull();
    expect(cleanSearchQuery('   ')).toBeNull();
  });

  test('accents and normal punctuation are preserved — unaccent happens in SQL, not here', () => {
    expect(cleanSearchQuery('Algès, été')).toBe('Algès, été');
  });
});
