import { expect, test } from 'vitest';

import { decodeCp1252 } from './cp1252.ts';

test('ASCII bytes decode as themselves', () => {
  expect(decodeCp1252(Buffer.from('Belize 1999', 'ascii'))).toBe('Belize 1999');
});

test('the 0xA0-0xFF range matches Latin-1 — French accents decode correctly', () => {
  // à(0xE0) è(0xE8) é(0xE9) ç(0xE7) — exactement ce que dit le spike : décodés en
  // UTF-8 sans cette table, ils produiraient des accents corrompus.
  const bytes = Buffer.from([0xe0, 0x20, 0xe8, 0x20, 0xe9, 0x20, 0xe7]);
  expect(decodeCp1252(bytes)).toBe('à è é ç');
});

test('the 0x80-0x9F range is where cp1252 diverges from Latin-1 — smart quotes and dashes', () => {
  // 0x93/0x94 guillemets typographiques, 0x97 tiret cadratin, 0x92 apostrophe
  // courbe : du texte copié depuis Word en produit couramment.
  const bytes = Buffer.from([0x93, 0x41, 0x94, 0x20, 0x97, 0x20, 0x92]);
  expect(decodeCp1252(bytes)).toBe('“A” — ’');
});

test('the euro sign at 0x80', () => {
  expect(decodeCp1252(Buffer.from([0x80]))).toBe('€');
});
