import { matchesSearch } from './searchFold';

// Built from explicit code points, never a literal accented character in
// source — a file's own encoding could silently normalise a typed
// character to one canonical form, and the whole point here is telling
// the two forms apart.
const E_GRAVE_NFC = 'è'; // precomposed e-grave
const E_GRAVE_NFD = 'è'; // 'e' + a combining grave accent
const algesNFC = `Alg${E_GRAVE_NFC}s`;
const algesNFD = `Alg${E_GRAVE_NFD}s`;

describe('matchesSearch — client-side substring filter, spec §5.7', () => {
  test('an empty query matches everything', () => {
    expect(matchesSearch('2000-2001/2000-11-BVI', '')).toBe(true);
    expect(matchesSearch('2000-2001/2000-11-BVI', '   ')).toBe(true);
  });

  test('a substring anywhere in the string matches, not just a prefix', () => {
    expect(matchesSearch('2000-2001/2000-11-BVI', 'BVI')).toBe(true);
    expect(matchesSearch('1998-1999/1998-10-Alicante', '1999')).toBe(true);
  });

  test('a non-matching query does not match', () => {
    expect(matchesSearch('2000-2001/2000-11-BVI', 'Venezuela')).toBe(false);
  });

  test('case-insensitive', () => {
    expect(matchesSearch('2000-2001/2000-11-BVI', 'bvi')).toBe(true);
    expect(matchesSearch('2000-2001/2000-11-bvi', 'BVI')).toBe(true);
  });

  test('accent-insensitive, NFC haystack, plain query', () => {
    expect(matchesSearch(`1998-02-Maison rose ${algesNFC}`, 'Alges')).toBe(true);
  });

  test('accent-insensitive, NFD haystack — the real backend has been seen storing this way', () => {
    expect(matchesSearch(`1998-02-Maison rose ${algesNFD}`, 'Alges')).toBe(true);
  });

  test('accent-insensitive, NFD query on an NFC haystack — a person can type either form', () => {
    expect(matchesSearch(`1998-02-Maison rose ${algesNFC}`, algesNFD)).toBe(true);
  });
});
