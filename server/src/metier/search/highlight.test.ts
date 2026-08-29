import { expect, test } from 'vitest';

import { highlight } from './highlight.ts';

test('offsets are UTF-16 units — the semantics of String.prototype.slice', () => {
  const text = 'Un été à Algès';
  const [range] = highlight(text, ['Algès']);
  expect(range).toBeDefined();
  expect(text.slice(range?.start ?? 0, (range?.start ?? 0) + (range?.length ?? 0))).toBe('Algès');
});

test('an emoji outside the BMP counts as two units, like the client counts it', () => {
  const text = '🚤 vers Belize';
  const [range] = highlight(text, ['Belize']);
  expect(range).toBeDefined();
  expect(text.slice(range?.start ?? 0, (range?.start ?? 0) + (range?.length ?? 0))).toBe('Belize');
  // '🚤' mesure 2 unités UTF-16 (hors PMB) + ' vers ' (6) = 8 avant 'Belize'.
  expect(range?.start).toBe(8);
});

test('highlighting is accent- and case-insensitive, like the search that found it', () => {
  expect(highlight('à Algès', ['alges'])).toHaveLength(1);
  expect(highlight('à ALGÈS', ['alges'])).toHaveLength(1);
});

test('multiple terms produce multiple ranges, in order of appearance', () => {
  const text = 'Belize, puis le Guatemala, puis le Belize encore';
  const ranges = highlight(text, ['belize', 'guatemala']);
  expect(ranges).toHaveLength(3);
  expect(ranges.map((r) => text.slice(r.start, r.start + r.length))).toEqual(['Belize', 'Guatemala', 'Belize']);
});

test('no match returns an empty array, never throws', () => {
  expect(highlight('rien ici', ['belize'])).toEqual([]);
});

test('an empty term list returns an empty array', () => {
  expect(highlight('du texte', [])).toEqual([]);
});
