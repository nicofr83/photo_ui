import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { TaskDetailSchema } from '../api/contract/task';
import { useUpdateTask } from '../api/hooks/useTasks';
import { firstDayOfMonth, lastDayOfMonth, toMonthInput } from '../domain/monthRange';
import { parseIsoDate } from '../shared/date_interface';
import { ErrorBanner } from '../ui/primitives/ErrorBanner';
import { FixedHeader } from '../ui/primitives/FixedHeader';
import scrollStyles from '../ui/primitives/FixedHeader.module.css';
import { TaskNav } from '../ui/primitives/TaskNav';

import styles from './ConsigneScreen.module.css';

/**
 * v1.5, Task 5: the LLM instruction and the task's declared period, moved
 * here out of ReviewScreen — a fourth sub-page between Textes and Revue,
 * its own URL like the other three, not a tab of the review screen.
 */
export function ConsigneScreen({ slug }: { readonly slug: string }): React.JSX.Element {
  const task = useQuery({
    queryKey: ['task', slug],
    queryFn: ({ signal }) => apiGet(`/tasks/${slug}`, TaskDetailSchema, signal),
  });
  const updateTask = useUpdateTask(slug);
  const [brief, setBrief] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [exportDirectory, setExportDirectory] = useState('');

  // Sync FROM the loaded task once, and again whenever it changes from
  // OUTSIDE this form (a save landing, a fresh navigation) — never
  // overwrites what the person is mid-typing, since nothing echoes back
  // here until a save actually happens.
  useEffect(() => {
    if (task.data === undefined) return;
    setBrief(task.data.brief);
    setPeriodFrom(toMonthInput(task.data.period?.from ?? null));
    setPeriodTo(toMonthInput(task.data.period?.to ?? null));
    setExportDirectory(task.data.exportDirectory ?? '');
  }, [task.data]);

  if (task.error !== null) return <ErrorBanner error={task.error} />;
  if (task.isPending) return <p role="status">Chargement de la tâche…</p>;

  const periodStart = firstDayOfMonth(periodFrom);
  const periodEnd = lastDayOfMonth(periodTo);
  const periodComplete = periodStart !== null && periodEnd !== null;

  return (
    <section className={styles['screen']}>
      <FixedHeader>
        <TaskNav slug={slug} />
        <h1>Consigne — {task.data.title}</h1>
      </FixedHeader>
      <div className={`${String(scrollStyles['scrolls'])} ${String(styles['content'])}`}>

      {updateTask.error !== null ? <ErrorBanner error={updateTask.error} /> : null}

      <label className={styles['brief']}>
        Consigne pour le LLM
        <textarea
          className={styles['briefInput']}
          value={brief}
          onChange={(event) => { setBrief(event.target.value); }}
        />
      </label>
      <button
        className={styles['save']}
        type="button"
        disabled={brief === task.data.brief}
        onClick={() => { updateTask.mutate({ brief }); }}
      >
        Enregistrer la consigne
      </button>

      {/* Spec §5.1: the date range a task is DECLARED to cover — distinct
          from anything a photo or text itself asserts. Month/year, not a
          day picker: the corpus runs 1998–2004, and an input that opens on
          today and has to be stepped back 264 months is unusable regardless
          of whether typing into it works (Nicolas, live). Typable at both
          fields, same draft-until-complete pattern as the filter panel's
          date range (domain/monthRange.ts). */}
      <fieldset className={styles['brief']}>
        <legend>Période de la tâche</legend>
        <p className={styles['note']}>
          {task.data.period === null
            ? 'Aucune période déclarée.'
            : `Actuellement : ${task.data.period.from} → ${task.data.period.to}`}
        </p>
        <label className={styles['field']}>
          Premier mois
          <input
            className={styles['control']}
            type="month"
            value={periodFrom}
            onChange={(event) => { setPeriodFrom(event.target.value); }}
          />
        </label>
        <label className={styles['field']}>
          Dernier mois
          <input
            className={styles['control']}
            type="month"
            value={periodTo}
            onChange={(event) => { setPeriodTo(event.target.value); }}
          />
        </label>
        <button
          className={styles['save']}
          type="button"
          disabled={!periodComplete}
          onClick={() => {
            if (periodStart === null || periodEnd === null) return;
            updateTask.mutate({ period: { from: parseIsoDate(periodStart), to: parseIsoDate(periodEnd) } });
          }}
        >
          Enregistrer la période
        </button>
        {task.data.period === null ? null : (
          <button
            className={styles['save']}
            type="button"
            onClick={() => { updateTask.mutate({ period: null }); }}
          >
            Effacer la période
          </button>
        )}
      </fieldset>

      {/* v1.5, Task 13: this is where a task DECLARES what it is — the
          repository field used to live only in the export dialog, one-shot;
          DIRECTORY_OUTSIDE_ROOT (a real refusal, contract A8) surfaces
          through the shared ErrorBanner above, which already shows the
          server's own message verbatim. */}
      <fieldset className={styles['brief']}>
        <legend>Livraison</legend>
        <p className={styles['note']}>
          {task.data.exportDirectory === null
            ? 'Défaut : <TASKS_ROOT>/<slug du dossier>.'
            : `Actuellement : ${task.data.exportDirectory}`}
        </p>
        <label className={styles['field']}>
          Répertoire de livraison
          <input
            className={styles['control']}
            type="text"
            value={exportDirectory}
            onChange={(event) => { setExportDirectory(event.target.value); }}
          />
        </label>
        <button
          className={styles['save']}
          type="button"
          onClick={() => {
            updateTask.mutate({ exportDirectory: exportDirectory === '' ? null : exportDirectory });
          }}
        >
          Enregistrer le répertoire
        </button>
      </fieldset>
      </div>
    </section>
  );
}
