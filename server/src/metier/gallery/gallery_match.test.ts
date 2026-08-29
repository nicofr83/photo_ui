import { describe, expect, test } from 'vitest';

import { findBestMatch, isConfidentMatch } from './gallery_match.ts';

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
