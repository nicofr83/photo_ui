import type { Album } from '../api/contract/album';

/**
 * The one order every screen that lists albums must agree on — spec §5.4/
 * §5.7, Nicolas live: "comme l'année est en 1er cela sera par ordre
 * chronologique". A plain string sort on `path`: the `AAAA-MM` prefix gives
 * chronological order for free, so there is no date to parse and no
 * suspected-first grouping to maintain — on 82 unlabelled entries a person
 * needs to FIND the one they want, which a stable-but-arbitrary order does
 * not give them.
 */
export function sortAlbumsByPath(albums: readonly Album[]): Album[] {
  return [...albums].sort((a, b) => a.path.localeCompare(b.path));
}
