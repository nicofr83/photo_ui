import { usePhotos } from '../../api/hooks/usePhotos';
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
}

export function PhotoGrid({
  params,
  selected,
  onToggle,
  onSelectAll,
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
            />
          </li>
        ))}
      </ul>
    </>
  );
}
