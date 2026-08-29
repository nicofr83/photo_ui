import { describe, expect, test } from 'vitest';

import { dedupeByLinkKey, findBestMatch, isConfidentMatch } from './gallery_match.ts';

describe('findBestMatch', () => {
  test('picks the closest hash, and the margin is the gap to the SECOND closest', () => {
    const library = new Map([
      ['sha-close', 0b0000n],   // XOR 0b0001 = 0b0001, distance 1
      ['sha-mid', 0b0111n],     // XOR 0b0001 = 0b0110, distance 2
      ['sha-far', 0b1111n],     // XOR 0b0001 = 0b1110, distance 3
    ]);
    const match = findBestMatch(0b0001n, library);
    expect(match).toEqual({ sha256: 'sha-close', distance: 1, margin: 1 });   // 2 - 1
  });

  test('an empty library has no match at all', () => {
    expect(findBestMatch(0n, new Map())).toBeNull();
  });

  test('a single candidate has an undefined second-best — the margin is reported as the full width', () => {
    const library = new Map([['only', 0b0000n]]);
    const match = findBestMatch(0b0001n, library);
    expect(match?.distance).toBe(1);
    expect(match?.margin).toBe(64);
  });

  test('exact tie for best: the margin is zero, never negative', () => {
    const library = new Map([['a', 0b0001n], ['b', 0b0001n]]);
    const match = findBestMatch(0n, library);
    expect(match?.distance).toBe(1);
    expect(match?.margin).toBe(0);
  });

  test('a real exact match (distance 0) still reports its margin against the runner-up', () => {
    // 0xabcd ^ 0xabc0 = 0x000d = 0b1101, trois bits : distance 3.
    const library = new Map([['exact', 0xabcdn], ['other', 0xabc0n]]);
    const match = findBestMatch(0xabcdn, library);
    expect(match).toEqual({ sha256: 'exact', distance: 0, margin: 3 });
  });
});

describe('isConfidentMatch — the spike’s own rule: d ≤ 6 and margin ≥ 4', () => {
  test('within both thresholds: confident', () => {
    expect(isConfidentMatch({ sha256: 'x', distance: 6, margin: 4 })).toBe(true);
    expect(isConfidentMatch({ sha256: 'x', distance: 0, margin: 64 })).toBe(true);
  });

  test('distance too large, even with a wide margin: not confident', () => {
    expect(isConfidentMatch({ sha256: 'x', distance: 7, margin: 20 })).toBe(false);
  });

  test('margin too narrow, even at distance 0: not confident — the ambiguous-neighbour case', () => {
    expect(isConfidentMatch({ sha256: 'x', distance: 0, margin: 3 })).toBe(false);
  });
});

describe('dedupeByLinkKey — app.web_gallery_link is unique on (sha256, image_path), NOT page', () => {
  const link = (sha256: string, imagePath: string, distance: number, margin: number) =>
    ({ sha256, imagePath, distance, margin, page: 'irrelevant' });

  test('two different keys both survive', () => {
    const links = [link('a', 'x.jpg', 2, 5), link('b', 'y.jpg', 3, 5)];
    expect(dedupeByLinkKey(links)).toHaveLength(2);
  });

  test('a repeated key keeps the LOWER distance', () => {
    const links = [link('a', 'x.jpg', 5, 5), link('a', 'x.jpg', 2, 5)];
    expect(dedupeByLinkKey(links)).toEqual([link('a', 'x.jpg', 2, 5)]);
  });

  test('a tie on distance keeps the WIDER margin', () => {
    const links = [link('a', 'x.jpg', 2, 4), link('a', 'x.jpg', 2, 9)];
    expect(dedupeByLinkKey(links)).toEqual([link('a', 'x.jpg', 2, 9)]);
  });

  test('the same imagePath under a DIFFERENT sha256 is a different key — not collapsed', () => {
    const links = [link('a', 'x.jpg', 2, 5), link('b', 'x.jpg', 2, 5)];
    expect(dedupeByLinkKey(links)).toHaveLength(2);
  });

  test('an empty input yields an empty output', () => {
    expect(dedupeByLinkKey([])).toEqual([]);
  });
});
