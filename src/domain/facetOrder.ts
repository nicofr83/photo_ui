import type { FacetBucket } from '../api/contract/photo';

/**
 * V1.7, Nicolas: "les tags/personnes/lieu selectionne devrait etre affiche en
 * haut de la liste... Le reste de la liste est en mode alphabetique." A
 * checked value moves to `pinned`, alphabetical among itself; everything
 * else stays in `rest`, also alphabetical. Plain code-unit order, not
 * `Intl.Collator` — same reasoning as `sortAlbumsByPath`: no Collator option
 * puts accented names in the order a person expects any more reliably than
 * plain `<` already does on this corpus.
 */
export function partitionFacets(
  buckets: readonly FacetBucket[],
  checked: readonly string[],
): { pinned: FacetBucket[]; rest: FacetBucket[] } {
  const byValue = (a: FacetBucket, b: FacetBucket): number => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0);
  const sorted = [...buckets].sort(byValue);
  return {
    pinned: sorted.filter((b) => checked.includes(b.value)),
    rest: sorted.filter((b) => !checked.includes(b.value)),
  };
}
