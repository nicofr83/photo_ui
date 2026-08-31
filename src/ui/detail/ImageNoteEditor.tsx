import { useEffect, useState } from 'react';

import styles from './ImageNoteEditor.module.css';

interface Props {
  readonly note: string | null;
  readonly onSave: (next: string | null) => void;
  readonly isPending?: boolean;
}

/**
 * V1.6, Nicolas: "je desire pouvoir entrer un commentaire sur les images
 * selectionnees" — `TaskImageSelection.note`, already served and accepted
 * by the server; only the interface was missing. A HUMAN comment written
 * TODAY, attached to one image — never the period text (`texts[]`), never
 * the machine caption (`images[].caption`). Same component at Images and
 * Revue (via `ImageModal`'s `children` slot), draft-until-saved like every
 * other form in this app (Consigne, NotesPanel).
 */
export function ImageNoteEditor({ note, onSave, isPending = false }: Props): React.JSX.Element {
  const [draft, setDraft] = useState(note ?? '');

  useEffect(() => { setDraft(note ?? ''); }, [note]);

  return (
    <label className={styles['field']}>
      Commentaire
      <textarea
        className={styles['textarea']}
        value={draft}
        onChange={(event) => { setDraft(event.target.value); }}
      />
      <button
        className={styles['save']}
        type="button"
        disabled={isPending || draft === (note ?? '')}
        onClick={() => { onSave(draft === '' ? null : draft); }}
      >
        Enregistrer
      </button>
    </label>
  );
}
