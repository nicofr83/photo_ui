import { useState } from 'react';

import { useCorrection } from '../../api/hooks/useCorrection';
import { useNotes, type Notes } from '../../api/hooks/useNotes';
import type { TaskNote } from '../../api/contract/task';
import type { TextUnit } from '../../api/contract/text';
import { isIsoDate, parseIsoDate } from '../../shared/date_interface';
import { ResolvedDateView } from '../date/ResolvedDate';
import { NoteEditor } from '../notes/NoteEditor';

import styles from './JournalRow.module.css';

interface Props {
  readonly unit: TextUnit;
  readonly slug: string;
  /** Pre-built (spec: "journal de bord, page 12 du 04/11/2003") — the page's
   * own ordinal/date, not the line's, same rule as `NoteFromTextButton`. */
  readonly noteTitle: string;
  /** A note already deriving from THIS line, if one exists — `undefined`
   * otherwise. There is never more than one: spec, "une ligne, une note". */
  readonly existingNote: TaskNote | undefined;
}

/**
 * Spec, "le registre en tableau" / "la case « Créer une note »": one row —
 * date, text (never truncated), a correction pencil, and the note checkbox.
 * "Cocher ouvre l'éditeur aussitôt... Il n'y a pas d'état intermédiaire, pas
 * de case cochée sans note" — the checkbox itself only ever reflects whether
 * a note EXISTS; opening the editor does not flip it early.
 */
export function JournalRow({ unit, slug, noteTitle, existingNote }: Props): React.JSX.Element {
  const correction = useCorrection();
  const notes: Notes = useNotes(slug);

  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(unit.text);
  const [draftDate, setDraftDate] = useState(unit.date?.start ?? '');
  const [creatingNote, setCreatingNote] = useState(false);

  const startEditing = (): void => {
    setDraftText(unit.text);
    setDraftDate(unit.date?.start ?? '');
    setEditing(true);
  };

  const saveCorrection = (): void => {
    if (draftText.trim() === '') return;
    const date = draftDate === ''
      ? null
      : isIsoDate(draftDate) ? { start: parseIsoDate(draftDate), end: parseIsoDate(draftDate) } : null;
    void correction.submit({ ref: unit.ref, text: draftText, date }).then(() => { setEditing(false); });
  };

  const onCheckToggle = (checked: boolean): void => {
    if (checked) {
      setCreatingNote(true);
      return;
    }
    if (existingNote === undefined) return;
    // Spec: "décocher une case dont la note existe demande confirmation,
    // puis supprime la note" — never a silent loss of a written note.
    if (window.confirm('Supprimer la note créée depuis cette ligne ?')) {
      void notes.remove(existingNote.id);
    }
  };

  const createNote = (text: string): void => {
    void notes.create({
      title: noteTitle, text,
      attachedTo: { images: [], texts: [unit.ref] },
      derivedFrom: unit.ref,
    }).then(() => { setCreatingNote(false); });
  };

  return (
    <tr className={styles['row']} data-testid={`journal-row-${unit.ref.id}`}>
      <td className={styles['date']}><ResolvedDateView date={unit.date} /></td>
      <td className={styles['text']}>
        {editing ? (
          <div className={styles['editing']}>
            <textarea
              className={styles['draft']}
              value={draftText}
              onChange={(event) => { setDraftText(event.target.value); }}
            />
            <label className={styles['dateField']}>
              Date
              <input
                className={styles['dateInput']}
                type="date"
                value={draftDate}
                onChange={(event) => { setDraftDate(event.target.value); }}
              />
            </label>
            <div className={styles['editingActions']}>
              <button
                className={styles['button']}
                type="button"
                disabled={draftText.trim() === '' || correction.isPending}
                onClick={saveCorrection}
              >
                Enregistrer
              </button>
              <button className={styles['button']} type="button" onClick={() => { setEditing(false); }}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className={styles['textBody']}>{unit.text}</p>
            {unit.correction === null ? null : (
              <p className={styles['original']}>{unit.textOriginal}</p>
            )}
          </>
        )}
      </td>
      <td className={styles['correct']}>
        <button
          className={styles['pencil']}
          type="button"
          title="Corriger la transcription"
          aria-label="Corriger la transcription"
          onClick={startEditing}
        >
          ✎
        </button>
      </td>
      <td className={styles['noteCell']}>
        <label className={styles['checkLabel']}>
          <input
            type="checkbox"
            checked={existingNote !== undefined}
            aria-label={`Créer une note pour la ligne ${String(unit.ordinal)}`}
            onChange={(event) => { onCheckToggle(event.target.checked); }}
          />
        </label>
        {!creatingNote ? null : (
          <NoteEditor
            initialText={unit.text}
            onCreate={createNote}
            onCancel={() => { setCreatingNote(false); }}
            isPending={notes.isPending}
            error={notes.error}
          />
        )}
      </td>
    </tr>
  );
}
