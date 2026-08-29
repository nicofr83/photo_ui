import { expect, test } from 'vitest';

import { normalizeNfc } from './nfc.ts';

const NFD = 'Algès';   // ce que macOS écrit — 'e' + accent grave combinant
const NFC = 'Algès';         // ce qu'on tape

test('the two spellings really are different before normalisation', () => {
  expect(NFD).not.toBe(NFC);
  expect(NFD.length).toBe(6);
  expect(NFC.length).toBe(5);
});

test('normalises every string field of a row', () => {
  expect(normalizeNfc({ albumPath: `1998-1999/1998-02-Maison rose ${NFD}`, width: 800 }))
    .toEqual({ albumPath: '1998-1999/1998-02-Maison rose Algès', width: 800 });
});

test('leaves null, numbers and booleans alone — absent is not zero', () => {
  expect(normalizeNfc({ a: null, b: 0, c: false, d: undefined }))
    .toEqual({ a: null, b: 0, c: false, d: undefined });
});

test('normalises inside nested objects and arrays', () => {
  expect(normalizeNfc({ people: [NFD], place: { city: NFD } }))
    .toEqual({ people: [NFC], place: { city: NFC } });
});

test('a bare string round-trips too — rows are not the only caller', () => {
  expect(normalizeNfc(NFD)).toBe(NFC);
});
