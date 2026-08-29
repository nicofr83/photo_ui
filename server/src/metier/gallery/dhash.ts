/**
 * Le dHash « moyenne de surface » de `docs/spike-dhash-galeries.md` §6 — la
 * variante qui corrige le hash du pipeline, dont le filtre de réduction
 * (un rééchantillonnage affine, pas une moyenne) est trop sensible au
 * repliement pour comparer une photo à sa copie web redimensionnée.
 *
 * PURE : prend des pixels déjà rendus à 72×64 (voir `io/sips.ts`), ne
 * touche à rien d'autre. C'est ce qui la rend testable sans image réelle.
 */
export interface PixelSource {
  readonly width: number;
  readonly height: number;
  pixelAt(x: number, y: number): readonly [number, number, number];
}

const RENDER_WIDTH = 72;
const RENDER_HEIGHT = 64;
const BLOCK_SIZE = 8;
const BLOCK_COLS = RENDER_WIDTH / BLOCK_SIZE;    // 9
const BLOCK_ROWS = RENDER_HEIGHT / BLOCK_SIZE;   // 8

/** Luminance entière sur les valeurs sRGB ENCODÉES — la formule du pipeline, verbatim. */
function luminance(r: number, g: number, b: number): number {
  return r * 299 + g * 587 + b * 114;
}

/**
 * `docs/spike-dhash-galeries.md` §2 et §6 : image rendue à 72×64 (rapport
 * d'aspect ignoré), réduite à une grille 9×8 par MOYENNE de chaque bloc
 * 8×8 — pas un point échantillonné — puis un bit par comparaison de voisin
 * horizontal : `L(x) > L(x+1)`. Ordre des bits : `y` en boucle externe
 * (0→7), `x` en boucle interne (0→7), bit 0 = (y=0, x=0). 64 bits au total,
 * représentés en `bigint` — un `number` JS perd sa précision au-delà de 2^53.
 */
export function surfaceAverageHash(pixels: PixelSource): bigint {
  if (pixels.width !== RENDER_WIDTH || pixels.height !== RENDER_HEIGHT) {
    throw new Error(
      `surfaceAverageHash exige une image 72×64, reçu ${String(pixels.width)}×${String(pixels.height)}`);
  }

  const grid: number[][] = [];
  for (let blockY = 0; blockY < BLOCK_ROWS; blockY++) {
    const row: number[] = [];
    for (let blockX = 0; blockX < BLOCK_COLS; blockX++) {
      let sum = 0;
      for (let dy = 0; dy < BLOCK_SIZE; dy++) {
        for (let dx = 0; dx < BLOCK_SIZE; dx++) {
          const [r, g, b] = pixels.pixelAt(blockX * BLOCK_SIZE + dx, blockY * BLOCK_SIZE + dy);
          sum += luminance(r, g, b);
        }
      }
      row.push(sum / (BLOCK_SIZE * BLOCK_SIZE));
    }
    grid.push(row);
  }

  let hash = 0n;
  let bit = 0;
  for (let y = 0; y < BLOCK_ROWS; y++) {
    const row = grid[y];
    if (row === undefined) continue;
    for (let x = 0; x < BLOCK_COLS - 1; x++) {
      if ((row[x] ?? 0) > (row[x + 1] ?? 0)) hash |= 1n << BigInt(bit);
      bit++;
    }
  }
  return hash;
}

/** Distance de Hamming entre deux hashes 64 bits — le nombre de bits qui diffèrent. */
export function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x !== 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/** 16 caractères hexadécimaux, comme le pipeline sérialise le sien (§2). */
export function formatHash(hash: bigint): string {
  return hash.toString(16).padStart(16, '0');
}
