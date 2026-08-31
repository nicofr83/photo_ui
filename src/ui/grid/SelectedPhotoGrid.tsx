import { useTaskReview } from '../../api/hooks/useTaskReview';
import { ErrorBanner } from '../primitives/ErrorBanner';

import { PhotoTile } from './PhotoTile';
import styles from './PhotoGrid.module.css';

interface Props {
  readonly slug: string;
  readonly onToggle: (cloudAssetId: string, shift: boolean) => void;
  readonly onOpen?: (cloudAssetId: string) => void;
}

/**
 * V1.6, Nicolas (live use): "voir les images sélectionnées" — composing a
 * task with no way to see what is already in it was the most annoying gap
 * in practice. `GET /tasks/:slug/review` already returns every retained
 * image in full `PhotoListItem` shape (ReviewScreen consumes the same
 * field) — no `/photos` round trip, no new endpoint, and none of the other
 * filter axes apply here: everything shown is, by definition, already the
 * whole selection. `SelectionHeader`'s "select all N results" would be
 * meaningless in this view (there is nothing left to add), so this is a
 * deliberately separate, simpler component rather than PhotoGrid stretched
 * to cover a data source it was never about.
 */
export function SelectedPhotoGrid({ slug, onToggle, onOpen }: Props): React.JSX.Element {
  const review = useTaskReview(slug);

  if (review.error !== null) return <ErrorBanner error={review.error} />;
  if (review.isPending) {
    return (
      <p className={styles['status']} role="status">
        Chargement des images…
      </p>
    );
  }

  return (
    <>
      <p className={styles['status']} data-testid="selected-count">
        {review.data.images.length} image{review.data.images.length > 1 ? 's' : ''} sélectionnée
        {review.data.images.length > 1 ? 's' : ''}
      </p>
      <ul className={styles['grid']}>
        {review.data.images.map((photo) => (
          <li key={photo.cloudAssetId}>
            <PhotoTile
              photo={photo}
              selected
              onToggle={onToggle}
              {...(onOpen === undefined ? {} : { onOpen })}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
