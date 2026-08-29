import type { TextRef, TextUnit } from '../../api/contract/text';
import { CorrectionStatus, PageSpanSource, TranscriptionConfidence } from '../../shared/enums';
import { ResolvedDateView } from '../date/ResolvedDate';

import styles from './TextCard.module.css';

interface Props {
  readonly unit: TextUnit;
  readonly onShowPhotos?: (ref: TextRef) => void;
}

const CONFIDENCE: Record<TranscriptionConfidence, string | null> = {
  [TranscriptionConfidence.TRANSCRIBED]: null,
  [TranscriptionConfidence.REVIEWED]: 'transcription relue',
  [TranscriptionConfidence.UNCERTAIN]: 'transcription incertaine',
};

/**
 * `carried` is an inference on an inference: the page names no day and takes
 * the previous one's. It has to show, and it is NOT a fourth date nature — it
 * qualifies the window, beside the date, never inside it.
 */
const SPAN_SOURCE: Record<PageSpanSource, string> = {
  [PageSpanSource.PASSAGES]: 'fenêtre déduite des passages de la page',
  [PageSpanSource.ENTRIES]: 'fenêtre déduite des entrées de la page',
  [PageSpanSource.CARRIED]: 'fenêtre reportée de la page précédente',
};

export function TextCard({ unit, onShowPhotos }: Props): React.JSX.Element {
  const confidence = CONFIDENCE[unit.confidence];

  return (
    <article className={styles['card']} data-testid={`text-${unit.ref.kind}-${unit.ref.id}`}>
      <div className={styles['meta']}>
        {/* A text that asserts no date says so. It is never guessed. */}
        {unit.date === null ? (
          <span className={styles['undetermined']} data-testid="text-date">
            date indéterminée
          </span>
        ) : (
          <span data-testid="text-date">
            <ResolvedDateView date={unit.date} />
          </span>
        )}

        {unit.pageSpanSource === null ? null : (
          <span className={styles['spanSource']} data-testid="span-source">
            {SPAN_SOURCE[unit.pageSpanSource]}
          </span>
        )}

        {confidence === null ? null : (
          <span className={styles['uncertain']} data-testid="confidence">{confidence}</span>
        )}

        {unit.correction !== null && unit.correction.status !== CorrectionStatus.APPLIED ? (
          <span className={styles['review']} data-testid="correction-status">
            correction à revoir
          </span>
        ) : null}

        {unit.overlappingPhotoCount > 0 && onShowPhotos !== undefined ? (
          <button
            className={styles['photos']}
            type="button"
            onClick={() => { onShowPhotos(unit.ref); }}
          >
            {unit.overlappingPhotoCount} photos
          </button>
        ) : null}
      </div>

      <p className={styles['text']} data-testid="text-effective">{unit.text}</p>

      {/* A correction never destroys the transcription: both coexist. */}
      {unit.correction !== null ? (
        <p className={styles['original']} data-testid="text-original">{unit.textOriginal}</p>
      ) : null}
    </article>
  );
}
