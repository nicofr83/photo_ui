import { useEffect, useRef } from 'react';

import type { FacetBucket } from '../../api/contract/photo';
import { partitionFacets } from '../../domain/facetOrder';

import styles from './PinnedFacetList.module.css';

interface Props {
  readonly buckets: readonly FacetBucket[];
  readonly checked: readonly string[];
  readonly onToggle: (value: string) => void;
  readonly deemphasised?: (bucket: FacetBucket) => boolean;
  readonly disabled?: boolean;
}

/**
 * V1.7, Nicolas: "les tags/personnes/lieu selectionne devrait etre affiche
 * en haut de la liste, et si possible ne pas scroller. Le reste de la liste
 * est en mode alphabetique." Shared by Tags, Personnes, Pays, Villes — the
 * four axes team-lead named.
 *
 * The pinned zone and the rest are TWO separate scroll regions on purpose
 * (team-lead: twenty checked facets cannot eat the screen — cap the pinned
 * zone's own height and scroll IT, the list below keeping its place) — a
 * single shared list could not do that. The cost of two regions is that
 * moving a checkbox from one to the other is, structurally, a different
 * parent: React cannot reuse the DOM node across it, so it remounts, and a
 * remount drops keyboard focus and the screen reader's position to nothing.
 * `lastToggled` below is what stands in for that lost DOM identity — the
 * VALUE that moved, not the node — and the effect finds and refocuses the
 * live node at its new position after every commit. Focus follows the
 * element, not a position in a list.
 */
export function PinnedFacetList({
  buckets, checked, onToggle, deemphasised, disabled = false,
}: Props): React.JSX.Element {
  const { pinned, rest } = partitionFacets(buckets, checked);
  const lastToggled = useRef<string | null>(null);

  // V1.7 live finding: `usePhotoFacets` has no `placeholderData` — a filter
  // change is a NEW query key, so a real network round-trip renders at least
  // once with `facets.data` genuinely `undefined` before the refetch lands
  // (invisible against MSW's near-instant mocks, real against the actual
  // server). That intermediate render has no bucket for ANY value, so the
  // querySelector below finds nothing — clearing `lastToggled` unconditionally
  // on that render would burn the one attempt before the checkbox exists
  // again, permanently losing focus to <body>. Only a SUCCESSFUL focus
  // retires the pending value; every other commit keeps retrying.
  useEffect(() => {
    if (lastToggled.current === null) return;
    const value = lastToggled.current;
    const input = document.querySelector<HTMLInputElement>(
      `input[data-facet-value="${CSS.escape(value)}"]`,
    );
    if (input === null) return;
    input.focus();
    lastToggled.current = null;
  });

  const handleToggle = (value: string): void => {
    lastToggled.current = value;
    onToggle(value);
  };

  const row = (bucket: FacetBucket, isChecked: boolean): React.JSX.Element => (
    <BucketCheckbox
      key={bucket.value}
      bucket={bucket}
      checked={isChecked}
      deemphasised={deemphasised?.(bucket) ?? false}
      disabled={disabled}
      onToggle={() => { handleToggle(bucket.value); }}
    />
  );

  return (
    <>
      {pinned.length === 0 ? null : (
        <div className={styles['pinned']} data-testid="pinned-facets">
          {pinned.map((bucket) => row(bucket, true))}
        </div>
      )}
      {rest.map((bucket) => row(bucket, false))}
    </>
  );
}

function BucketCheckbox({
  bucket, checked, onToggle, deemphasised, disabled,
}: {
  readonly bucket: FacetBucket;
  readonly checked: boolean;
  readonly onToggle: () => void;
  readonly deemphasised: boolean;
  readonly disabled: boolean;
}): React.JSX.Element {
  return (
    <label className={[styles['row'], deemphasised ? styles['broad'] : null].filter(Boolean).join(' ')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={bucket.value}
        data-facet-value={bucket.value}
        onChange={onToggle}
      />
      <span>{bucket.value}</span>
      <span className={styles['count']}>({bucket.count})</span>
    </label>
  );
}
