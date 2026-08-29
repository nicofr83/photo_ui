import { useState } from 'react';

import type { PhotoListItem } from '../../api/contract/photo';
import { ResolvedDateView } from '../date/ResolvedDate';

import styles from './PhotoTile.module.css';

export interface PhotoTileProps {
  readonly photo: PhotoListItem;
  readonly selected: boolean;
  /** `shift` carries the range intent; the caller owns what a range means. */
  readonly onToggle: (cloudAssetId: string, shift: boolean) => void;
}

export function PhotoTile({ photo, selected, onToggle }: PhotoTileProps): React.JSX.Element {
  const [thumbFailed, setThumbFailed] = useState(false);
  const heldElsewhere = photo.inTaskSlugs.length > 0;

  return (
    <figure className={styles['tile']}>
      <div className={styles['frame']}>
        {thumbFailed ? (
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
        <span className={styles['fileName']} title={photo.fileName}>
          {photo.fileName}
        </span>
      </figcaption>
    </figure>
  );
}
