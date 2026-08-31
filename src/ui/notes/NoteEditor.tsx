import { useState } from 'react';

import type { ApiError } from '../../api/client';
import { ErrorBanner } from '../primitives/ErrorBanner';

import styles from './NoteEditor.module.css';

interface Props {
  readonly initialText: string;
  readonly onCreate: (text: string) => void;
  readonly onCancel: () => void;
  readonly isPending?: boolean;
  readonly error?: ApiError | null;
}

/**
 * V1.7, spec "la case « Créer une note »" / "Sélectionner et créer": ONE
 * editor, shared by the journal (checking a line), "Ma vie" and the web
 * site (highlighting a selection) — "il ouvre le même éditeur que le
 * journal". Prefilled with the source text, editable — retouching it here
 * is what the capital rule calls "ce que Nicolas dit aujourd'hui à propos
 * de ce que la page disait", never a change to the source itself.
 */
export function NoteEditor({
  initialText, onCreate, onCancel, isPending = false, error = null,
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState(initialText);

  return (
    <div className={styles['editor']}>
      {error !== null ? <ErrorBanner error={error} /> : null}
      <textarea
        className={styles['textarea']}
        value={draft}
        onChange={(event) => { setDraft(event.target.value); }}
      />
      <div className={styles['actions']}>
        <button
          className={styles['create']}
          type="button"
          disabled={draft.trim() === '' || isPending}
          onClick={() => { onCreate(draft); }}
        >
          Créer la note
        </button>
        <button className={styles['cancel']} type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}
