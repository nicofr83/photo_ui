import { expect, test } from 'vitest';

import { decodeBmp24 } from './bmp_decode.ts';

/**
 * Construit un BMP 24 bits minimal, RVB->BGR par pixel, lignes paddées à 4
 * octets. `rows[0]` est la ligne écrite EN PREMIER dans le fichier — le sens
 * (haut-bas ou bas-haut) est décidé par `topDown`, comme un vrai encodeur.
 */
function buildBmp24(
  width: number, height: number, rows: readonly (readonly [number, number, number])[][],
  topDown: boolean,
): Buffer {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;
  const buf = Buffer.alloc(fileSize);

  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);          // offset des pixels
  buf.writeUInt32LE(40, 14);          // taille de l'en-tête DIB
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(topDown ? -height : height, 22);
  buf.writeUInt16LE(1, 26);           // plans
  buf.writeUInt16LE(24, 28);          // bits par pixel
  buf.writeUInt32LE(0, 30);           // BI_RGB, pas de compression

  for (const [rowIndex, row] of rows.entries()) {
    const offset = 54 + rowIndex * rowSize;
    for (const [x, [r, g, b]] of row.entries()) {
      buf.writeUInt8(b, offset + x * 3);
      buf.writeUInt8(g, offset + x * 3 + 1);
      buf.writeUInt8(r, offset + x * 3 + 2);
    }
  }
  return buf;
}

test('decodes a top-down BMP, row order preserved as written', () => {
  const bmp = buildBmp24(2, 2, [
    [[255, 0, 0], [0, 255, 0]],   // ligne 0, écrite en premier : rouge, vert
    [[0, 0, 255], [10, 20, 30]],  // ligne 1
  ], true);

  const decoded = decodeBmp24(bmp);
  expect(decoded.width).toBe(2);
  expect(decoded.height).toBe(2);
  expect(decoded.pixelAt(0, 0)).toEqual([255, 0, 0]);
  expect(decoded.pixelAt(1, 0)).toEqual([0, 255, 0]);
  expect(decoded.pixelAt(0, 1)).toEqual([0, 0, 255]);
  expect(decoded.pixelAt(1, 1)).toEqual([10, 20, 30]);
});

test('decodes a bottom-up BMP — the file’s first row is the image’s LAST', () => {
  const bmp = buildBmp24(2, 2, [
    [[0, 0, 255], [10, 20, 30]],  // écrite en premier dans le fichier = ligne du BAS
    [[255, 0, 0], [0, 255, 0]],   // écrite en second = ligne du HAUT
  ], false);

  const decoded = decodeBmp24(bmp);
  // Le résultat logique (y=0 en haut) doit être IDENTIQUE au cas top-down ci-dessus.
  expect(decoded.pixelAt(0, 0)).toEqual([255, 0, 0]);
  expect(decoded.pixelAt(1, 1)).toEqual([10, 20, 30]);
});

test('handles row padding to a 4-byte boundary — width=1 needs 3 bytes of padding', () => {
  const bmp = buildBmp24(1, 3, [[[1, 2, 3]], [[4, 5, 6]], [[7, 8, 9]]], true);
  const decoded = decodeBmp24(bmp);
  expect(decoded.pixelAt(0, 0)).toEqual([1, 2, 3]);
  expect(decoded.pixelAt(0, 1)).toEqual([4, 5, 6]);
  expect(decoded.pixelAt(0, 2)).toEqual([7, 8, 9]);
});

test('refuses anything that is not an uncompressed 24-bit BMP, naming what it found', () => {
  const bmp = buildBmp24(2, 2, [[[0, 0, 0], [0, 0, 0]], [[0, 0, 0], [0, 0, 0]]], true);
  bmp.writeUInt16LE(32, 28);   // 32 bits par pixel, pas 24
  expect(() => decodeBmp24(bmp)).toThrow(/24/);
});

test('refuses a buffer that does not start with the BM magic', () => {
  expect(() => decodeBmp24(Buffer.from('not a bmp file at all'))).toThrow(/BM/);
});
