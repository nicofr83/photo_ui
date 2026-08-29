import { useState } from 'react';

import { useCreateTask, useDeleteTask, useDuplicateTask, useTasks } from '../api/hooks/useTasks';
import type { TaskSummary } from '../api/contract/task';
import { slugify } from '../domain/slug';
import { TaskState } from '../shared/enums';
import { ErrorBanner } from '../ui/primitives/ErrorBanner';
import styles from '../ui/tasks/TaskList.module.css';

const STATE_LABELS: Record<TaskState, string> = {
  [TaskState.DRAFT]: 'brouillon',
  [TaskState.EXPORTED]: 'exportée',
  [TaskState.EXPORTED_STALE]: 'exportée, modifiée depuis',
};

interface Props {
  readonly onOpen: (slug: string) => void;
}

export function TasksScreen({ onOpen }: Props): React.JSX.Element {
  const tasks = useTasks();
  const create = useCreateTask();
  // Lifted out of TaskRow: deleting a task removes it from `tasks.data`, so
  // a row that kept its own "deleted" state would unmount along with the
  // confirmation it was about to show.
  const [deleted, setDeleted] = useState<Record<string, { exportDirectoryKept: string | null }>>({});

  const [title, setTitle] = useState('');
  // The slug is derived until the user overrides it. It is editable at creation
  // ONLY (spec §5.1): renaming it later would orphan a folder already on disk.
  const [slugOverride, setSlugOverride] = useState<string | null>(null);
  const slug = slugOverride ?? slugify(title);

  const submit = (): void => {
    create.mutate(
      { slug, title, brief: '', period: null },
      { onSuccess: () => { setTitle(''); setSlugOverride(null); } },
    );
  };

  return (
    <section>
      <h1>Tâches</h1>

      {/* Creation may be impossible while consultation still works. */}
      {create.error !== null ? <ErrorBanner error={create.error} /> : null}
      {tasks.error !== null ? <ErrorBanner error={tasks.error} /> : null}

      <form
        className={styles['form']}
        onSubmit={(event) => { event.preventDefault(); submit(); }}
      >
        <label className={styles['field']}>
          Titre
          <input
            className={styles['control']}
            value={title}
            onChange={(event) => { setTitle(event.target.value); }}
          />
        </label>
        <label className={styles['field']}>
          Identifiant du dossier
          <input
            className={styles['control']}
            value={slug}
            onChange={(event) => { setSlugOverride(event.target.value); }}
          />
        </label>
        <p className={styles['hint']}>
          C’est le nom du dossier livré. Modifiable à la création seulement.
        </p>
        <button className={styles['submit']} type="submit" disabled={slug === ''}>
          Créer la tâche
        </button>
      </form>

      {tasks.isPending ? <p role="status">Chargement des tâches…</p> : null}

      <ul className={styles['list']}>
        {tasks.data?.items.map((task) => (
          <TaskRow
            key={task.slug}
            task={task}
            onOpen={onOpen}
            onDeleted={(exportDirectoryKept) => {
              setDeleted((d) => ({ ...d, [task.slug]: { exportDirectoryKept } }));
            }}
          />
        ))}
        {Object.entries(deleted).map(([slug, info]) => (
          <li className={styles['row']} key={slug} data-testid={`task-deleted-${slug}`}>
            Tâche supprimée.
            {info.exportDirectoryKept === null ? null : (
              <> Le dossier déjà exporté est conservé : {info.exportDirectoryKept}.</>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TaskRow({
  task, onOpen, onDeleted,
}: {
  readonly task: TaskSummary;
  readonly onOpen: (slug: string) => void;
  readonly onDeleted: (exportDirectoryKept: string | null) => void;
}): React.JSX.Element {
  const duplicate = useDuplicateTask();
  const remove = useDeleteTask();
  const [duplicating, setDuplicating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [newTitle, setNewTitle] = useState(`${task.title} (copie)`);
  const [newSlug, setNewSlug] = useState(`${task.slug}-copie`);

  const confirmDuplicate = (): void => {
    void duplicate.mutateAsync({ slug: task.slug, title: newTitle, newSlug })
      .then(() => { setDuplicating(false); })
      .catch(() => undefined);
  };

  const confirmDelete = (): void => {
    void remove.mutateAsync(task.slug)
      .then((result) => { onDeleted(result.exportDirectoryKept); })
      .catch(() => undefined);
  };

  return (
    <li className={styles['row']} data-testid={`task-${task.slug}`}>
      <span className={styles['title']}>{task.title}</span>
      <span className={styles['counts']}>
        {task.imageCount} image{task.imageCount > 1 ? 's' : ''} ·{' '}
        {task.textCount} texte{task.textCount > 1 ? 's' : ''} ·{' '}
        {task.noteCount} note{task.noteCount > 1 ? 's' : ''}
      </span>
      <span className={styles['state']}>{STATE_LABELS[task.state]}</span>

      <button className={styles['open']} type="button" onClick={() => { onOpen(task.slug); }}>
        Ouvrir {task.title}
      </button>

      {duplicate.error !== null ? <ErrorBanner error={duplicate.error} /> : null}
      {remove.error !== null ? <ErrorBanner error={remove.error} /> : null}

      {duplicating ? (
        <span className={styles['field']}>
          <label>
            Titre
            <input
              className={styles['control']}
              value={newTitle}
              onChange={(e) => { setNewTitle(e.target.value); }}
            />
          </label>
          <label>
            Identifiant
            <input
              className={styles['control']}
              value={newSlug}
              onChange={(e) => { setNewSlug(e.target.value); }}
            />
          </label>
          <button type="button" onClick={confirmDuplicate} disabled={duplicate.isPending}>
            Confirmer la duplication
          </button>
          <button type="button" onClick={() => { setDuplicating(false); }}>
            Annuler
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => { setDuplicating(true); }}>
          Dupliquer
        </button>
      )}

      {confirmingDelete ? (
        <>
          <button type="button" onClick={confirmDelete} disabled={remove.isPending}>
            Confirmer la suppression
          </button>
          <button type="button" onClick={() => { setConfirmingDelete(false); }}>
            Annuler
          </button>
        </>
      ) : (
        <button type="button" onClick={() => { setConfirmingDelete(true); }}>
          Supprimer
        </button>
      )}
    </li>
  );
}
