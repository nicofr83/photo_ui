import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { apiGet } from '../api/client';
import type { TaskReview, TaskReviewWarnings } from '../api/contract/review';
import { TaskDetailSchema } from '../api/contract/task';
import { useExport } from '../api/hooks/useExport';
import { useJob } from '../api/hooks/useJob';
import { useSelection } from '../api/hooks/useSelection';
import { useSystemStatus } from '../api/hooks/useSystemStatus';
import { useTaskReview } from '../api/hooks/useTaskReview';
import { overlaps } from '../domain/interval';
import { originalsUnavailable } from '../domain/systemStatus';
import { sourceOf, TEXT_SOURCE_TITLES, TextSource } from '../domain/textSource';
import { NotesPanel } from '../ui/notes/NotesPanel';
import { ErrorBanner } from '../ui/primitives/ErrorBanner';
import { FixedHeader } from '../ui/primitives/FixedHeader';
import scrollStyles from '../ui/primitives/FixedHeader.module.css';
import { TaskNav } from '../ui/primitives/TaskNav';
import { Chronology } from '../ui/review/Chronology';
import { ControlBanner } from '../ui/review/ControlBanner';
import styles from '../ui/review/ReviewList.module.css';
import { TextCard } from '../ui/texts/TextCard';

/**
 * Spec §5.6: most of the eight counters can be turned into "which entries
 * match" using data this same call already returned — no second
 * implementation of the recouvrement predicate. `imagesWithoutText` needs
 * the WHOLE corpus (not just this task's own texts) to know for certain, and
 * `orphanedImages`/`orphanedTexts` name selections this payload does not
 * even include (the orphaned photo or text is gone, by definition) — those
 * three stay explanation-only in ControlBanner rather than highlighting
 * nothing and looking broken.
 */
function highlightIdsFor(key: keyof TaskReviewWarnings | null, review: TaskReview): Set<string> | null {
  if (key === null) return null;
  const period = review.task.period;

  switch (key) {
    case 'undatedImages':
      return new Set(review.images.filter((i) => i.date === null).map((i) => i.cloudAssetId));
    case 'inferredDateImages':
      return new Set(
        review.images.filter((i) => i.date?.kind === 'inference').map((i) => i.cloudAssetId),
      );
    case 'imagesOutOfPeriod':
      return new Set(
        review.images
          .filter((i) => period !== null && i.date !== null
            && !overlaps(i.date, { start: period.from, end: period.to }))
          .map((i) => i.cloudAssetId),
      );
    case 'uncertainTexts':
      return new Set(
        review.texts.filter((t) => t.confidence === 'uncertain')
          .map((t) => `${t.ref.kind}:${t.ref.id}`),
      );
    default:
      // imagesWithoutText, orphanedImages, orphanedTexts, textsWiderThan30Days:
      // this payload cannot answer them precisely — ControlBanner's
      // explanation text carries the meaning instead of a wrong highlight.
      return null;
  }
}

const SKIP_REASONS: Record<string, string> = {
  SOURCE_FILE_MISSING: 'fichier introuvable',
  NOT_RENDERABLE: 'format non rendable',
  VOLUME_UNAVAILABLE: 'volume absent',
};

/**
 * v1.5, Task 7: the same three-sources-never-mixed rule as TextsScreen
 * (spec §5.3), applied to the task's retained texts instead of a whole
 * document's. `domain/textSource.ts#groupBySource` operates on documents,
 * not on units — this mirrors it with `sourceOf` directly.
 */
function groupTextsBySource(
  texts: TaskReview['texts'],
): ReadonlyArray<{ source: TextSource; title: string; texts: TaskReview['texts'] }> {
  return Object.values(TextSource)
    .map((source) => ({
      source, title: TEXT_SOURCE_TITLES[source],
      texts: texts.filter((t) => sourceOf(t.documentId) === source),
    }))
    .filter((group) => group.texts.length > 0);
}

export function ReviewScreen({ slug }: { readonly slug: string }): React.JSX.Element {
  const task = useQuery({
    queryKey: ['task', slug],
    queryFn: ({ signal }) => apiGet(`/tasks/${slug}`, TaskDetailSchema, signal),
  });
  const selection = useSelection(slug);
  const exportTask = useExport(slug);
  // POST /tasks/:slug/export ALWAYS answers 202 with a queued/running job —
  // the outcome (report or "directory exists") only exists once this poll
  // reaches a terminal state. exportJob.data supersedes exportTask.data as
  // soon as its first fetch lands; before that, the mutation's own response
  // is already a valid (non-terminal) Job to fall back on.
  const exportJob = useJob(exportTask.data?.id ?? null);
  const job = exportJob.data ?? exportTask.data ?? null;
  const review = useTaskReview(slug);
  const systemStatus = useSystemStatus();
  const volumeUnavailable = systemStatus.data !== undefined && originalsUnavailable(systemStatus.data);
  const [activeWarning, setActiveWarning] = useState<keyof TaskReviewWarnings | null>(null);

  if (task.error !== null) return <ErrorBanner error={task.error} />;
  if (task.isPending) return <p role="status">Chargement de la tâche…</p>;

  const report = job?.result?.report ?? null;
  const jobRunning = job !== null && (job.state === 'queued' || job.state === 'running');
  const highlightIds = review.data === undefined ? null : highlightIdsFor(activeWarning, review.data);
  // Task 7: the thumbnail comes from GET /tasks/:slug/review, already
  // fetched above — never a second request just to get a src.
  const thumbUrlFor = (cloudAssetId: string): string | undefined =>
    review.data?.images.find((i) => i.cloudAssetId === cloudAssetId)?.thumbUrl;
  const textGroups = review.data === undefined ? [] : groupTextsBySource(review.data.texts);

  return (
    <section className={styles['screen']}>
      <FixedHeader>
        <TaskNav slug={slug} />
        <h1>Revue — {task.data.title}</h1>
      </FixedHeader>
      <div className={`${String(scrollStyles['scrolls'])} ${String(styles['content'])}`}>

      {/* Spec §5.6: non-blocking — every count is informational, none
          refuses the export below. */}
      {review.error !== null ? <ErrorBanner error={review.error} /> : null}
      {review.data === undefined ? null : (
        <>
          <ControlBanner warnings={review.data.warnings} onActiveChange={setActiveWarning} />
          <Chronology timeline={review.data.timeline} highlightIds={highlightIds} />
        </>
      )}

      {/* La consigne au LLM et la période de la tâche s'ÉDITENT sur Consigne
          (v1.5, Task 5) — leur propre sous-page. Rappelée ici en lecture
          seule : ce que le LLM lira ne devrait pas se deviner. */}
      <div className={styles['brief']} data-testid="brief-recall">
        <p>{task.data.brief === '' ? 'Aucune consigne.' : task.data.brief}</p>
        <Link to={`/consigne/${slug}`}>Modifier sur Consigne</Link>
      </div>

      <p className={styles['note']} data-testid="order-note">
        Ordre chronologique par défaut — c’est celui que le LLM lira.
      </p>

      {review.data === undefined ? <p role="status">Chargement…</p> : (
      <ul className={styles['list']} aria-label="Images de la tâche">
        {selection.images.map((image, index) => (
          <li
            className={styles['row']}
            key={image.cloudAssetId}
            data-testid={`review-image-${image.cloudAssetId}`}
          >
            <img
              className={styles['thumb']}
              src={thumbUrlFor(image.cloudAssetId)}
              alt={`Vignette ${image.cloudAssetId.slice(0, 8)}`}
              width={64}
            />
            <span>{image.cloudAssetId.slice(0, 8)}</span>
            <button
              className={styles['move']}
              type="button"
              disabled={index === 0}
              aria-label={`Monter ${image.cloudAssetId.slice(0, 8)}`}
              onClick={() => { void selection.moveUp(image.cloudAssetId); }}
            >
              ▲ Monter
            </button>
            <button
              className={styles['move']}
              type="button"
              disabled={index === selection.images.length - 1}
              aria-label={`Descendre ${image.cloudAssetId.slice(0, 8)}`}
              onClick={() => { void selection.moveDown(image.cloudAssetId); }}
            >
              ▼ Descendre
            </button>
            <button
              className={styles['remove']}
              type="button"
              onClick={() => { void selection.remove([image.cloudAssetId]); }}
            >
              Retirer {image.cloudAssetId.slice(0, 8)}
            </button>
          </li>
        ))}
      </ul>
      )}

      {textGroups.length === 0 ? null : (
        <div role="list" aria-label="Textes de la tâche">
          {textGroups.map((group) => (
            <section key={group.source}>
              <h2>{group.title}</h2>
              {group.texts.map((text) => (
                <div role="listitem" key={`${text.ref.kind}:${text.ref.id}`}>
                  <TextCard unit={text} />
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {/* The POST itself only ever fails synchronously for something OTHER
          than "directory exists" — e.g. IMPORT_IN_PROGRESS, a mutant job
          already running. That case IS surfaced here, at the mutation. */}
      {exportTask.error !== null ? <ErrorBanner error={exportTask.error} /> : null}

      {/* exportTask succeeding only ever hands back a queued/running job —
          the export itself runs inside the job runner, so "the directory
          exists" (or any other outcome) can only be learned by polling it
          to a terminal state. Never overwrite in silence: name it and let
          the user choose. Spec §5.6. */}
      {job?.state === 'failed' && job.error !== null ? (
        <>
          <p className={styles['jobError']} role="alert">{job.error.message}</p>
          {job.error.code === 'TARGET_DIRECTORY_EXISTS' ? (
            <button
              className={styles['export']}
              type="button"
              onClick={() => { exportTask.mutate({ overwrite: true }); }}
            >
              Écraser le dossier existant
            </button>
          ) : null}
        </>
      ) : null}

      {jobRunning ? (
        <p className={styles['note']} role="status">Export en cours…</p>
      ) : null}

      {/* Spec §5.1/§9: vignettes and selections stay usable while the volume
          is unmounted; only the export, which needs the originals, is
          blocked — and says so, rather than failing opaquely. */}
      {volumeUnavailable ? (
        <p className={styles['note']} data-testid="export-blocked">
          Export bloqué : le volume des originaux est absent.
        </p>
      ) : null}

      <button
        className={styles['export']}
        type="button"
        disabled={volumeUnavailable}
        onClick={() => { exportTask.mutate({ overwrite: false }); }}
      >
        Exporter la tâche
      </button>

      {report !== null ? (
        <div className={styles['report']} data-testid="export-report">
          <p>
            {report.imagesWritten} image{report.imagesWritten > 1 ? 's' : ''} écrite
            {report.imagesWritten > 1 ? 's' : ''} dans {report.directory}.
          </p>
          {report.skippedImages.length > 0 ? (
            <ul className={styles['skipped']}>
              {report.skippedImages.map((skip) => (
                <li key={skip.cloudAssetId}>
                  {skip.cloudAssetId.slice(0, 8)} — {SKIP_REASONS[skip.reason] ?? skip.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <NotesPanel slug={slug} />
      </div>
    </section>
  );
}
