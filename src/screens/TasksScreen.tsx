import { useState } from 'react';

import { useCreateTask, useTasks } from '../api/hooks/useTasks';
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
          <li className={styles['row']} key={task.slug} data-testid={`task-${task.slug}`}>
            <span className={styles['title']}>{task.title}</span>
            <span className={styles['counts']}>
              {task.imageCount} image{task.imageCount > 1 ? 's' : ''} ·{' '}
              {task.textCount} texte{task.textCount > 1 ? 's' : ''} ·{' '}
              {task.noteCount} note{task.noteCount > 1 ? 's' : ''}
            </span>
            <span className={styles['state']}>{STATE_LABELS[task.state]}</span>
            <button
              className={styles['open']}
              type="button"
              onClick={() => { onOpen(task.slug); }}
            >
              Ouvrir {task.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
