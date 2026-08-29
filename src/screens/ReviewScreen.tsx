import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { TaskDetailSchema } from '../api/contract/task';
import { useExport } from '../api/hooks/useExport';
import { useSelection } from '../api/hooks/useSelection';
import { ErrorBanner } from '../ui/primitives/ErrorBanner';
import styles from '../ui/review/ReviewList.module.css';

const SKIP_REASONS: Record<string, string> = {
  source_file_missing: 'fichier introuvable',
  not_renderable: 'format non rendable',
  volume_unavailable: 'volume absent',
};

export function ReviewScreen({ slug }: { readonly slug: string }): React.JSX.Element {
  const task = useQuery({
    queryKey: ['task', slug],
    queryFn: ({ signal }) => apiGet(`/tasks/${slug}`, TaskDetailSchema, signal),
  });
  const selection = useSelection(slug);
  const exportTask = useExport(slug);
  const [brief, setBrief] = useState('');

  if (task.error !== null) return <ErrorBanner error={task.error} />;
  if (task.isPending) return <p role="status">Chargement de la tâche…</p>;

  const report = exportTask.data?.report ?? null;

  return (
    <section className={styles['screen']}>
      <h1>Revue — {task.data.title}</h1>

      <label className={styles['brief']}>
        Consigne pour le LLM
        <textarea
          className={styles['briefInput']}
          value={brief}
          onChange={(event) => { setBrief(event.target.value); }}
        />
      </label>

      <p className={styles['note']} data-testid="order-note">
        Ordre chronologique par défaut — c’est celui que le LLM lira.
      </p>

      <ul className={styles['list']}>
        {[...task.data.images]
          .sort((a, b) => a.order - b.order)
          .map((image) => (
            <li
              className={styles['row']}
              key={image.cloudAssetId}
              data-testid={`review-image-${image.cloudAssetId}`}
            >
              <span>{image.cloudAssetId.slice(0, 8)}</span>
              <button
                className={styles['remove']}
                type="button"
                onClick={() => { void selection.remove([image.cloudAssetId]); }}
              >
                Retirer scan-0007
              </button>
            </li>
          ))}
      </ul>

      {/* A 409 means the directory exists. Name it and let the user choose;
          never overwrite in silence. Spec §5.6. */}
      {exportTask.error !== null ? (
        <>
          <ErrorBanner error={exportTask.error} />
          {exportTask.error.code === 'TARGET_DIRECTORY_EXISTS' ? (
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

      <button
        className={styles['export']}
        type="button"
        onClick={() => { exportTask.mutate({ overwrite: false }); }}
      >
        Exporter la tâche
      </button>

      {report !== null ? (
        <div className={styles['report']} data-testid="export-report">
          <p>
            {report.written} image{report.written > 1 ? 's' : ''} écrite
            {report.written > 1 ? 's' : ''} dans {report.directory}.
          </p>
          {report.skipped.length > 0 ? (
            <ul className={styles['skipped']}>
              {report.skipped.map((skip) => (
                <li key={skip.cloudAssetId}>
                  {skip.fileName} — {SKIP_REASONS[skip.reason] ?? skip.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
