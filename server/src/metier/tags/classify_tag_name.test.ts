import { describe, expect, test } from 'vitest';

import { classifyTagName } from './classify_tag_name.ts';

describe('classifyTagName', () => {
  test('the two cases the spec names by name — italy on Tikal, egypt on Morocco', () => {
    expect(classifyTagName('italy')).toBe('place');
    expect(classifyTagName('egypt')).toBe('place');
  });

  test('confident countries, from the real vocabulary', () => {
    for (const name of ['france', 'spain', 'portugal', 'greece', 'guatemala', 'mexico',
                         'morocco', 'venezuela', 'cuba', 'croatia', 'tunisia', 'panama']) {
      expect(classifyTagName(name)).toBe('place');
    }
  });

  test('continents and water bodies', () => {
    for (const name of ['africa', 'europe', 'asia', 'antarctica', 'atlantic', 'pacific',
                         'mediterranean', 'caribbean']) {
      expect(classifyTagName(name)).toBe('place');
    }
  });

  test('a real specific site name from the corpus', () => {
    expect(classifyTagName('tikal')).toBe('place');
  });

  test('a multi-word tag containing a country name is NOT a place — "turkey vulture" is a bird', () => {
    expect(classifyTagName('turkey vulture')).toBe('descriptive');
    expect(classifyTagName('ancient egypt')).toBe('descriptive');
  });

  test('genuinely ambiguous names — country and common word both real — go to unknown, not a guess', () => {
    for (const name of ['turkey', 'china', 'jordan', 'nice', 'monaco', 'chad', 'georgia']) {
      expect(classifyTagName(name)).toBe('unknown');
    }
  });

  test('the overwhelming majority — ordinary descriptive vocabulary', () => {
    for (const name of ['blue', 'nature', 'sky', 'people', 'man', 'water', 'travel', 'woman',
                         'summer', 'sea', 'beautiful', 'girl', 'landscape', 'beach', 'boat']) {
      expect(classifyTagName(name)).toBe('descriptive');
    }
  });

  test('is case-insensitive — the vocabulary is lowercase but nothing here assumes it stays that way', () => {
    expect(classifyTagName('Italy')).toBe('place');
    expect(classifyTagName('EGYPT')).toBe('place');
  });
});
