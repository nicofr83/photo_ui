/**
 * Un décodeur BMP MINIMAL — 24 bits, non compressé, exactement ce que
 * `sips -s format bmp` produit. Choisi sur PNG pour cette seule raison :
 * pas de zlib à dérouler, pas de filtre de ligne, un en-tête fixe. Aucune
 * prétention à lire un BMP quelconque — tout le reste est refusé, nommé.
 */
export interface DecodedBmp {
  readonly width: number;
  readonly height: number;
  /** `[r, g, b]`, `(0,0)` en HAUT À GAUCHE quel que soit le sens d'écriture du fichier. */
  pixelAt(x: number, y: number): readonly [number, number, number];
}

export function decodeBmp24(buffer: Buffer): DecodedBmp {
  if (buffer.length < 54 || buffer.toString('ascii', 0, 2) !== 'BM') {
    throw new Error('pas un fichier BMP : la signature "BM" est absente');
  }

  const pixelOffset = buffer.readUInt32LE(10);
  const dibHeaderSize = buffer.readUInt32LE(14);
  if (dibHeaderSize < 40) {
    throw new Error(`en-tête DIB trop court pour BITMAPINFOHEADER : ${String(dibHeaderSize)} octets`);
  }

  const width = buffer.readInt32LE(18);
  const rawHeight = buffer.readInt32LE(22);
  const bitsPerPixel = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);

  if (bitsPerPixel !== 24) {
    throw new Error(`BMP non pris en charge : ${String(bitsPerPixel)} bits par pixel, 24 attendus`);
  }
  if (compression !== 0) {
    throw new Error(`BMP non pris en charge : compression ${String(compression)}, seul BI_RGB (0) l'est`);
  }

  // Hauteur NÉGATIVE = fichier écrit de haut en bas ; POSITIVE = de bas en haut.
  const topDown = rawHeight < 0;
  const height = Math.abs(rawHeight);
  const rowSize = Math.ceil((width * 3) / 4) * 4;   // lignes paddées à 4 octets

  return {
    width,
    height,
    pixelAt(x: number, y: number): readonly [number, number, number] {
      const fileRow = topDown ? y : height - 1 - y;
      const base = pixelOffset + fileRow * rowSize + x * 3;
      // BGR par pixel, pas RGB — convention BMP.
      return [buffer.readUInt8(base + 2), buffer.readUInt8(base + 1), buffer.readUInt8(base)];
    },
  };
}
