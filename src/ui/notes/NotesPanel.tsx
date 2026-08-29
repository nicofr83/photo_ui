import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '../../api/client';
import { TaskDetailSchema } from '../../api/contract/task';
import { useNotes } from '../../api/hooks/useNotes';
import { clearDraft, readDraft, writeDraft } from '../../domain/noteDraft';
import { ErrorBanner } from '../primitives/ErrorBanner';

import styles from './NotesPanel.module.css';

interface Props {
  readonly slug: string;
}

/**
 * Spec §5.5: free notes, per task. `attachedTo` is always empty here — a
 * general note, the common case ("celle-ci est floue" is true of the whole
 * task) — attaching one to a photo or a passage is offered from THAT
 * screen, not duplicated here.
 *
 * The draft (title + text not yet saved) survives navigation and reload,
 * scoped to this task, via `domain/noteDraft` — spec's own words: "brouillon
 * survivant côté client".
 */
export function NotesPanel({ slug }: Props): React.JSX.Element {
  const task = useQuery({
    queryKey: ['task', slug],
    queryFn: ({ signal }) => apiGet(`/tasks/${slug}`, TaskDetailSchema, signal),
  });
  const notes = useNotes(slug);

  const initial = readDraft(slug);
  const [title, setTitle] = useState(initial.title);
  const [text, setText] = useState(initial.text);

  // Every keystroke persists — a lost tab must not lose more than has not
  // yet been typed.
  useEffect(() => { writeDraft(slug, { title, text }); }, [slug, title, text]);

  const save = (): void => {
    if (text.trim() === '') return;
    void notes.create({ title, text, attachedTo: { images: [], texts: [] } }).then(() => {
      setTitle('');
      setText('');
      clearDraft(slug);
    });
  };

  return (
    <section className={styles['panel']}>
      <h2>Notes</h2>

      {notes.error !== null ? <ErrorBanner error={notes.error} /> : null}

      {task.data?.notes.length === 0 ? (
        <p className={styles['empty']}>Aucune note pour cette tâche.</p>
      ) : null}

      <ul className={styles['list']}>
        {task.data?.notes.map((note) => (
          <li className={styles['note']} key={note.id} data-testid={`note-${note.id}`}>
            {note.title !== '' ? <p className={styles['noteTitle']}>{note.title}</p> : null}
            <p className={styles['noteText']}>{note.text}</p>
            <button
              className={styles['remove']}
              type="button"
              onClick={() => { void notes.remove(note.id); }}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>

      <div className={styles['form']}>
        <label className={styles['field']}>
          Titre
          <input
            className={styles['control']}
            value={title}
            onChange={(event) => { setTitle(event.target.value); }}
          />
        </label>
        <label className={styles['field']}>
          Texte
          <textarea
            className={styles['textarea']}
            value={text}
            onChange={(event) => { setText(event.target.value); }}
          />
        </label>
        <button
          className={styles['save']}
          type="button"
          disabled={text.trim() === '' || notes.isPending}
          onClick={save}
        >
          Enregistrer
        </button>
      </div>
    </section>
  );
}
