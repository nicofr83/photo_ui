import { useState } from 'react';

import type { PhotoListItem } from '../../api/contract/photo';
import { ResolvedDateView } from '../date/ResolvedDate';

import styles from './PhotoTile.module.css';

export interface PhotoTileProps {
  readonly photo: PhotoListItem;
  readonly selected: boolean;
  /** `shift` carries the range intent; the caller owns what a range means. */
  readonly onToggle: (cloudAssetId: string, shift: boolean) => void;
  /** Omitted where the tile is not openable, as in the review list. */
  readonly onOpen?: (cloudAssetId: string) => void;
  /**
   * V1.6, Nicolas: "un clic sur une image devrait afficher l'image en
   * grand" — the same gesture as the Revue's own thumbnails, and a
   * DIFFERENT one from `onOpen` (the metadata panel): this enlarges the
   * photo, `onOpen` shows its date/tags/position/captions. Omitted where
   * enlarging is not offered. Passes the whole `PhotoListItem` — the grid
   * that fetched it already has it in hand (`renderUrl` included), and the
   * caller (`ImagesScreen`) does not otherwise hold what `PhotoGrid`/
   * `SelectedPhotoGrid` fetched internally.
   */
  readonly onEnlarge?: (photo: PhotoListItem) => void;
}

export function PhotoTile({
  photo,
  selected,
  onToggle,
  onOpen,
  onEnlarge,
}: PhotoTileProps): React.JSX.Element {
  const [thumbFailed, setThumbFailed] = useState(false);
  const heldElsewhere = photo.inTaskSlugs.length > 0;

  const thumb = thumbFailed ? (
    // Spec §5.2: never a void. Naming the file is what makes the failure
    // actionable -- the user can go and look for it.
    <p className={styles['unavailable']} data-testid="thumb-unavailable">
      Vignette absente : {photo.fileName}
    </p>
  ) : (
    <img
      className={styles['image']}
      data-testid="thumb"
      src={photo.thumbUrl}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => { setThumbFailed(true); }}
    />
  );

  return (
    <figure className={styles['tile']}>
      <div className={styles['frame']}>
        {onEnlarge === undefined ? thumb : (
          <button
            className={styles['enlarge']}
            type="button"
            aria-label={`Agrandir ${photo.fileName}`}
            onClick={() => { onEnlarge(photo); }}
          >
            {thumb}
          </button>
        )}

        <input
          className={styles['check']}
          type="checkbox"
          checked={selected}
          aria-label={`Sélectionner ${photo.fileName}`}
          onChange={(event) => {
            const native = event.nativeEvent as unknown as { shiftKey?: boolean };
            onToggle(photo.cloudAssetId, native.shiftKey === true);
          }}
        />

        {heldElsewhere ? (
          <span
            className={styles['marker']}
            data-testid="in-other-task"
            aria-label={`Déjà retenue dans : ${photo.inTaskSlugs.join(', ')}`}
          >
            ●
          </span>
        ) : null}
      </div>

      <figcaption className={styles['caption']}>
        <ResolvedDateView date={photo.date} />
        {onOpen === undefined ? (
          <span className={styles['fileName']} title={photo.fileName}>
            {photo.fileName}
          </span>
        ) : (
          <button
            className={styles['open']}
            type="button"
            onClick={() => { onOpen(photo.cloudAssetId); }}
          >
            Détail de {photo.fileName}
          </button>
        )}
      </figcaption>
    </figure>
  );
}
