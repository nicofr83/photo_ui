import { describe, expect, test } from 'vitest';

import { formatHash, hammingDistance, surfaceAverageHash, type PixelSource } from './dhash.ts';

/** Une image 72×64 synthétique : `luminance(x, y)` décide de chaque pixel (gris pur). */
function synthetic(luminance: (x: number, y: number) => number): PixelSource {
  return {
    width: 72,
    height: 64,
    pixelAt: (x, y) => {
      const l = Math.round(luminance(x, y));
      return [l, l, l];
    },
  };
}

describe('surfaceAverageHash', () => {
  test('a perfectly uniform image sets NO bit — every neighbour is equal, never greater', () => {
    expect(surfaceAverageHash(synthetic(() => 128))).toBe(0n);
  });

  test('each block is AVERAGED, not point-sampled — one stray pixel does not flip a bit', () => {
    // Bloc (0,0) : 63 pixels à 250, UN à 0 → moyenne = 15750/64 = 246,09.
    // Bloc (1,0) : uniformément à 245. 246,09 > 245 : bit 0 posé.
    // Un échantillonnage PONCTUEL du pixel (0,0) lirait 0, et 0 > 245 est faux —
    // c'est précisément la différence que ce test vérifie.
    const l = synthetic((x, y) => {
      if (x === 0 && y === 0) return 0;    // le seul pixel du bloc (0,0) qui dévie
      if (x < 8) return 250;               // le reste du bloc (0,0)
      if (x < 16) return 245;              // bloc (1,0)
      return 100;
    });
    const hash = surfaceAverageHash(l);
    expect(hash & 1n).toBe(1n);   // bit 0 = (y=0, x=0)
  });

  test('a left-bright, right-dark image sets exactly the bits the neighbour rule predicts', () => {
    // 9 colonnes de blocs, luminance strictement décroissante de gauche à droite :
    // chaque comparaison L(x) > L(x+1) est vraie, tous les bits d'une ligne sont à 1.
    const l = synthetic((x) => 255 - Math.floor(x / 8) * 20);
    const hash = surfaceAverageHash(l);
    // 8 lignes × 8 bits = 64 bits, tous à 1.
    expect(hash).toBe((1n << 64n) - 1n);
  });

  test('a right-bright, left-dark image sets NO bit — the rule is strictly ">"', () => {
    const l = synthetic((x) => Math.floor(x / 8) * 20);
    expect(surfaceAverageHash(l)).toBe(0n);
  });

  test('is deterministic — the same pixels always produce the same hash', () => {
    const l = synthetic((x, y) => (x * 7 + y * 13) % 256);
    expect(surfaceAverageHash(l)).toBe(surfaceAverageHash(l));
  });

  test('refuses anything that is not exactly 72×64 — the algorithm is defined for that grid only', () => {
    expect(() => surfaceAverageHash({ width: 71, height: 64, pixelAt: () => [0, 0, 0] }))
      .toThrow(/72.*64|72x64|72×64/);
  });
});

describe('hammingDistance', () => {
  test('a hash against itself is zero', () => {
    expect(hammingDistance(0xabcdn, 0xabcdn)).toBe(0);
  });

  test('two fully complementary 64-bit hashes are 64 apart', () => {
    const all = (1n << 64n) - 1n;
    expect(hammingDistance(0n, all)).toBe(64);
  });

  test('counts exactly the differing bits', () => {
    expect(hammingDistance(0b1010n, 0b1000n)).toBe(1);
    expect(hammingDistance(0b1111n, 0b0000n)).toBe(4);
  });

  test('is symmetric', () => {
    expect(hammingDistance(0x1234n, 0x5678n)).toBe(hammingDistance(0x5678n, 0x1234n));
  });
});

describe('formatHash', () => {
  test('renders 16 lowercase hex characters, zero-padded', () => {
    expect(formatHash(0n)).toBe('0000000000000000');
    expect(formatHash(0xabcdn)).toBe('000000000000abcd');
  });

  test('renders a full 64-bit value without truncation', () => {
    expect(formatHash((1n << 64n) - 1n)).toBe('ffffffffffffffff');
  });
});
