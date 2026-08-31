import { useEffect, useRef, useState } from 'react';

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
  /**
   * V1.7, Nicolas: "en sélectionnant une photo un commentaire devrait etre
   * demandé" — tranché: an inline field, never a modal (selecting forty
   * photos in a row has to stay fluid). Fires only when the field closes on
   * Enter with non-blank text; Escape and an empty Enter write nothing —
   * the SAME `note` as V1.6 (`TaskImageSelection.note`), no new field.
   * Omitted where the gesture is not offered (the Revue's already-selected
   * list only ever deselects here, never selects for the first time).
   */
  readonly onComment?: (cloudAssetId: string, note: string) => void;
  /**
   * V1.6/V1.7: the CURRENT server-known note for this photo, if it is
   * already selected — `null`/omitted otherwise. A comment retained across
   * a deselect-then-reselect (team-lead's ruling, server-side) only
   * arrives once the `add` mutation settles, strictly AFTER the field has
   * already opened with an empty draft — the effect below catches up once
   * it lands, never overwriting anything the person has since typed.
   */
  readonly existingNote?: string | null;
}

export function PhotoTile({
  photo,
  selected,
  onToggle,
  onOpen,
  onEnlarge,
  onComment,
  existingNote = null,
}: PhotoTileProps): React.JSX.Element {
  const [thumbFailed, setThumbFailed] = useState(false);
  const heldElsewhere = photo.inTaskSlugs.length > 0;

  // V1.7: local to THIS click, never derived from the `selected` prop — a
  // prop-watching effect would also fire for an already-selected photo
  // freshly mounted (scrolled into view, or a bulk "select all"), stealing
  // focus from whatever the user was actually doing. Only the checkbox's own
  // onChange, below, ever opens it.
  const [commenting, setCommenting] = useState(false);
  const [draft, setDraft] = useState('');
  const checkboxRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (commenting) fieldRef.current?.focus();
  }, [commenting]);

  // A retained comment restores server-side, strictly after the field has
  // already opened blank — catch up once it lands, but never clobber
  // whatever the person has typed since.
  useEffect(() => {
    if (commenting && draft === '' && existingNote !== null && existingNote !== '') {
      setDraft(existingNote);
    }
  }, [commenting, existingNote]);

  const closeField = (): void => {
    setCommenting(false);
    checkboxRef.current?.focus();
  };

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
          ref={checkboxRef}
          className={styles['check']}
          type="checkbox"
          checked={selected}
          aria-label={`Sélectionner ${photo.fileName}`}
          onChange={(event) => {
            const native = event.nativeEvent as unknown as { shiftKey?: boolean };
            const justSelected = !selected;
            onToggle(photo.cloudAssetId, native.shiftKey === true);
            if (justSelected && onComment !== undefined) {
              setDraft('');
              setCommenting(true);
            } else {
              setCommenting(false);
            }
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

      {/* V1.7: "sous la vignette" — a normal-flow row below the frame, not
          another absolute overlay on top of the thumbnail like `.check`/
          `.marker` above. */}
      {!commenting ? null : (
        <input
          ref={fieldRef}
          className={styles['comment']}
          type="text"
          aria-label={`Commentaire pour ${photo.fileName}`}
          placeholder="Commentaire (optionnel)"
          value={draft}
          onChange={(event) => { setDraft(event.target.value); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              const trimmed = draft.trim();
              if (trimmed !== '' && onComment !== undefined) onComment(photo.cloudAssetId, trimmed);
              closeField();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              closeField();
            }
          }}
        />
      )}

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
