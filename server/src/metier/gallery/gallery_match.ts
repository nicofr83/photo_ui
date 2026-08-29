import { hammingDistance } from './dhash.ts';

export interface GalleryMatch {
  readonly sha256: string;
  readonly distance: number;
  readonly margin: number;
}

const HASH_BITS = 64;

/**
 * Le meilleur candidat de la bibliothèque pour un hash de galerie, et sa
 * MARGE — l'écart au deuxième meilleur, le second discriminant du spike
 * (§5) : la distance seule ne sépare pas franchement signal et bruit, la
 * marge si. Une bibliothèque à un seul candidat n'a pas de second par quoi
 * mesurer une marge : elle vaut la largeur totale du hash, jamais l'infini.
 */
export function findBestMatch(
  galleryHash: bigint,
  library: ReadonlyMap<string, bigint>,
): GalleryMatch | null {
  let bestSha: string | null = null;
  let bestDistance = Infinity;
  let secondDistance = Infinity;

  for (const [sha256, hash] of library) {
    const distance = hammingDistance(galleryHash, hash);
    if (distance < bestDistance) {
      secondDistance = bestDistance;
      bestDistance = distance;
      bestSha = sha256;
    } else if (distance < secondDistance) {
      secondDistance = distance;
    }
  }

  if (bestSha === null) return null;
  const margin = secondDistance === Infinity ? HASH_BITS : secondDistance - bestDistance;
  return { sha256: bestSha, distance: bestDistance, margin };
}

const MAX_DISTANCE = 6;
const MIN_MARGIN = 4;

/**
 * La règle retenue (spike §8, hash moyenne de surface) : `d ≤ 6 et marge ≥
 * 4`. Un couple qui échoue ici n'est pas supprimé — il n'est simplement
 * jamais écrit dans `app.web_gallery_link`.
 */
export function isConfidentMatch(match: GalleryMatch): boolean {
  return match.distance <= MAX_DISTANCE && match.margin >= MIN_MARGIN;
}
