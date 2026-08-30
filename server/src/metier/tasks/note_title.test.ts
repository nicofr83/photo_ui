import { describe, expect, test } from 'vitest';

import { attributionPrefix, titleKeepsPrefix } from './note_title.ts';

describe('attributionPrefix', () => {
  test('stops at the first em dash', () => {
    expect(attributionPrefix('journal de bord, page 12 du 04/11/2003'))
      .toBe('journal de bord, page 12 du 04/11/2003');
    expect(attributionPrefix('journal de bord, page 12 du 04/11/2003 — la nuit du grain'))
      .toBe('journal de bord, page 12 du 04/11/2003');
    expect(attributionPrefix('site web, Vers Trinidad (1999-2002) — à relire'))
      .toBe('site web, Vers Trinidad (1999-2002)');
  });

  test('a title with no attribution prefix has none', () => {
    expect(attributionPrefix('Ce que le journal ne dit pas')).toBeNull();
  });

  test('recognizes all three sources', () => {
    expect(attributionPrefix('ma vie, page 7')).toBe('ma vie, page 7');
    expect(attributionPrefix('site web, x')).toBe('site web, x');
  });
});

describe('titleKeepsPrefix', () => {
  test('appending after the prefix is allowed, altering it is not', () => {
    const current = 'journal de bord, page 12 du 04/11/2003';
    expect(titleKeepsPrefix(current, `${current} — la nuit du grain`)).toBe(true);
    expect(titleKeepsPrefix(current, current)).toBe(true);
    expect(titleKeepsPrefix(current, 'journal de bord, page 13 du 04/11/2003')).toBe(false);
    expect(titleKeepsPrefix(current, 'la nuit du grain')).toBe(false);
    expect(titleKeepsPrefix(current, '')).toBe(false);
  });

  test('a title with no prefix to begin with accepts anything', () => {
    expect(titleKeepsPrefix('Ce que le journal ne dit pas', 'Autre chose entièrement')).toBe(true);
  });
});
