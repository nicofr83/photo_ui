import { expect, test } from 'vitest';

import { canonicalise, serialise } from './canonical.ts';

test('arrays Postgres does not order are SORTED before serialising', () => {
  const result = canonicalise({ people: ['Nicolas', 'Gigi'] }) as { people: string[] };
  expect(result.people).toEqual(['Gigi', 'Nicolas']);
});

test('an array of OBJECTS keeps its order — images/texts/notes are sequences, not sets', () => {
  const result = canonicalise({ images: [{ order: 1 }, { order: 0 }] }) as { images: { order: number }[] };
  expect(result.images.map((i) => i.order)).toEqual([1, 0]);
});

test('an optional field is an explicit null, never omitted', () => {
  expect(JSON.stringify(canonicalise({ city: null }))).toContain('"city":null');
});

test('two serialisations of the same content are byte-identical', () => {
  const task = { title: 'x', images: [{ cloudAssetId: 'a' }] };
  expect(serialise(task)).toBe(serialise(structuredClone(task)));
});

test('object keys become snake_case, mechanically', () => {
  const result = canonicalise({ cloudAssetId: 'a', bracketHours: 4 }) as Record<string, unknown>;
  expect(result).toEqual({ cloud_asset_id: 'a', bracket_hours: 4 });
});

test('object keys are sorted, for a stable byte-identical output regardless of insertion order', () => {
  expect(serialise({ b: 1, a: 2 })).toBe(serialise({ a: 2, b: 1 }));
});
