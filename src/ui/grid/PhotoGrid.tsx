import { usePhotos } from '../../api/hooks/usePhotos';
import type { PhotoListItem } from '../../api/contract/photo';
import { describeOverlap } from '../../domain/overlapSummary';
import { ErrorBanner } from '../primitives/ErrorBanner';

import { PhotoTile } from './PhotoTile';
import { SelectionHeader } from './SelectionHeader';
import styles from './PhotoGrid.module.css';

interface Props {
  readonly params: URLSearchParams;
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (cloudAssetId: string, shift: boolean) => void;
  /** Receives every id of the FILTER, not of the visible page. Spec §5.2. */
  readonly onSelectAll: (cloudAssetIds: string[]) => void;
  readonly onOpen?: (cloudAssetId: string) => void;
  readonly onEnlarge?: (photo: PhotoListItem) => void;
}

export function PhotoGrid({
  params,
  selected,
  onToggle,
  onSelectAll,
  onOpen,
  onEnlarge,
}: Props): React.JSX.Element {
  const { data, error, isPending } = usePhotos(params);

  // A refused filter is an error. Rendering an empty grid here would be the
  // silent disappearance spec §9.6.1 forbids.
  if (error !== null) return <ErrorBanner error={error} />;

  if (isPending) {
    return (
      <p className={styles['status']} role="status">
        Chargement des photos…
      </p>
    );
  }

  return (
    <>
      {/* Contract §4.2: only present when the overlap axis is active — a
          different response shape, not a null placeholder. Spec §4.3: what
          the proposal is worth AND where its weakness comes from. */}
      {'overlapSummary' in data ? (
        <p className={styles['overlapSummary']} data-testid="overlap-summary">
          {describeOverlap(data.overlapSummary)}
        </p>
      ) : null}

      <SelectionHeader
        page={data}
        selectedCount={selected.size}
        onSelectAll={() => { onSelectAll(data.items.map((p) => p.cloudAssetId)); }}
      />
      <ul className={styles['grid']}>
        {data.items.map((photo) => (
          <li key={photo.cloudAssetId}>
            <PhotoTile
              photo={photo}
              selected={selected.has(photo.cloudAssetId)}
              onToggle={onToggle}
              {...(onOpen === undefined ? {} : { onOpen })}
              {...(onEnlarge === undefined ? {} : { onEnlarge })}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
