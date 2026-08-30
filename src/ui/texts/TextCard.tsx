import { useState } from 'react';

import { useCorrection } from '../../api/hooks/useCorrection';
import { usePages } from '../../api/hooks/usePages';
import type { TextRef, TextUnit } from '../../api/contract/text';
import { CorrectionStatus, PageSpanSource, TranscriptionConfidence } from '../../shared/enums';
import { ResolvedDateView } from '../date/ResolvedDate';
import { ErrorBanner } from '../primitives/ErrorBanner';

import { PageViewer } from './PageViewer';
import styles from './TextCard.module.css';

interface Props {
  readonly unit: TextUnit;
  readonly onShowPhotos?: (ref: TextRef) => void;
  /** Contract §4.5: whether this text is held in the current task. */
  readonly selected?: boolean;
  readonly onToggleSelect?: () => void;
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

export function TextCard({ unit, onShowPhotos, selected, onToggleSelect }: Props): React.JSX.Element {
  const confidence = CONFIDENCE[unit.confidence];
  const [showPage, setShowPage] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(unit.text);
  const correction = useCorrection();

  const startEditing = (): void => { setDraft(unit.text); setEditing(true); };
  const save = (): void => {
    if (draft.trim() === '') return;
    void correction.submit({ ref: unit.ref, text: draft }).then(() => { setEditing(false); });
  };

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

        {/* Contract §11 Q11: a direct image match, its own register. An
            unverified one is a supposition — same treatment as `carried`,
            never shown as though a human had confirmed it. */}
        {unit.galleryCaption !== null ? (
          <span className={styles['spanSource']} data-testid="gallery-source">
            {unit.galleryCaption.page}
          </span>
        ) : null}
        {unit.galleryCaption !== null && !unit.galleryCaption.verified ? (
          <span className={styles['uncertain']} data-testid="gallery-match">
            correspondance non vérifiée
          </span>
        ) : null}

        {/* Spec, "la page ouverte": "le nombre d'images qu'elle recouvre" —
            the wording the whole app converges on for a cloud asset
            (TaskNav, ReviewScreen's list) is "images", not "photos". */}
        {unit.overlappingPhotoCount > 0 && onShowPhotos !== undefined ? (
          <button
            className={styles['photos']}
            type="button"
            onClick={() => { onShowPhotos(unit.ref); }}
          >
            {unit.overlappingPhotoCount} images
          </button>
        ) : null}

        {/* Spec §5.4: the facing page, only where one was scanned — the 569
            web passages have none, and the panel says so rather than offering
            a button that would open on nothing. */}
        {unit.pageId !== null ? (
          <button
            className={styles['photos']}
            type="button"
            onClick={() => { setShowPage((v) => !v); }}
          >
            {showPage ? 'Masquer la page' : 'Voir la page'}
          </button>
        ) : null}

        {!editing ? (
          <button className={styles['photos']} type="button" onClick={startEditing}>
            Corriger
          </button>
        ) : null}

        {unit.correction !== null && !editing ? (
          <button
            className={styles['photos']}
            type="button"
            onClick={() => { void correction.revert(unit.ref); }}
          >
            Rétablir
          </button>
        ) : null}

        {/* Contract §4.5/spec "la page ouverte": the text equivalent of the
            grid's photo checkbox — a real checkbox (v1.5, Task 9), not a
            toggle button: "chaque texte garde sa coche de sélection". */}
        {onToggleSelect === undefined ? null : (
          <label className={styles['selectLabel']}>
            <input type="checkbox" checked={selected === true} onChange={onToggleSelect} />
            {selected === true ? 'Retenu pour la tâche' : 'Retenir pour la tâche'}
          </label>
        )}
      </div>

      {correction.error !== null ? <ErrorBanner error={correction.error} /> : null}

      {editing ? (
        <div className={styles['editing']}>
          <textarea
            className={styles['draft']}
            value={draft}
            onChange={(event) => { setDraft(event.target.value); }}
          />
          <div className={styles['editingActions']}>
            <button
              className={styles['photos']}
              type="button"
              disabled={draft.trim() === '' || correction.isPending}
              onClick={save}
            >
              Enregistrer
            </button>
            <button className={styles['photos']} type="button" onClick={() => { setEditing(false); }}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <p className={styles['text']} data-testid="text-effective">{unit.text}</p>
      )}

      {/* A correction never destroys the transcription: both coexist. */}
      {unit.correction !== null && !editing ? (
        <p className={styles['original']} data-testid="text-original">{unit.textOriginal}</p>
      ) : null}

      {showPage && unit.pageId !== null ? (
        <FacingPage documentId={unit.documentId} pageId={unit.pageId} />
      ) : null}
    </article>
  );
}

function FacingPage({
  documentId, pageId,
}: {
  readonly documentId: string;
  readonly pageId: string;
}): React.JSX.Element {
  const pages = usePages(documentId);

  if (pages.error !== null) return <ErrorBanner error={pages.error} />;
  if (pages.isPending) return <p role="status">Chargement de la page…</p>;

  const page = pages.data.items.find((p) => p.id === pageId);
  // The document was loaded whole, so a missing page here is a genuine
  // inconsistency, not a filter — say so rather than showing nothing.
  if (page === undefined) return <p role="alert">Page introuvable ({pageId}).</p>;

  return <PageViewer page={page} />;
}
