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
/**
 * Plain code-unit order, not `Intl.Collator` — verified directly: no
 * Collator option (`caseFirst`, `sensitivity`, `numeric`, any combination)
 * puts "Fort Lauderdale" before "everglades". Unicode collation ranks by
 * BASE LETTER first ('e' < 'f') and only falls back to case as a tertiary
 * tiebreak between otherwise-identical letters ('a' vs 'A') — no locale
 * option turns "uppercase before lowercase" into a rule that overrides the
 * base letter itself. Plain `<` does exactly that (uppercase ASCII sorts
 * below lowercase), and the AAAA-MM prefixes this corpus actually uses stay
 * correctly ordered under it — all fixed-width digits, so no locale-aware
 * numeric comparison is needed to keep "1998" before "2000" before "2004".
 */
export function sortAlbumsByPath(albums: readonly Album[]): Album[] {
  return [...albums].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
