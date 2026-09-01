import { useEffect, useRef, useState } from 'react';

import { useNotes } from '../../api/hooks/useNotes';
import { useTexts } from '../../api/hooks/useTexts';
import type { TextPage } from '../../api/contract/text';
import { splitSentences } from '../../domain/sentenceSplit';
import { TextKind } from '../../shared/enums';
import { ErrorBanner } from '../primitives/ErrorBanner';
import { NoteEditor } from '../notes/NoteEditor';

import styles from './PageProse.module.css';

interface Props {
  readonly page: TextPage;
  readonly slug: string;
  /** Pre-built by the caller (spec: "journal de bord, page 12 du
   * 04/11/2003" / "ma vie, page 7 du 23/09/1999") — the page's own
   * ordinal/date, same rule wherever a note is derived from a page. */
  readonly noteTitle: string;
}

/**
 * Nicolas's ruling (2026-09-01): the journal's free-prose passages get "le
 * traitement de Ma vie" — this component IS that treatment, shared by both.
 * Passages gathered into one reading zone, in page order, one sentence per
 * line (`domain/sentenceSplit`, a display heuristic only — the stored text
 * never changes). Highlighting a non-empty selection surfaces "Créer une
 * note", the same shared editor, prefilled with whatever was selected —
 * retours à la ligne compris (spec: it is precisely why the "modifié"
 * comparison normalizes whitespace).
 *
 * `derivedFrom` names the whole PAGE, never a passage: a free selection can
 * cover two passages or half of one (spec, "la sélection libre") — true on
 * the journal exactly as on "Ma vie".
 */
export function PageProse({ page, slug, noteTitle }: Props): React.JSX.Element {
  const texts = useTexts(page.documentId, TextKind.PASSAGE);
  const notes = useNotes(slug);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const onSelectionChange = (): void => {
      const selection = window.getSelection();
      const container = containerRef.current;
      if (selection === null || selection.isCollapsed || container === null) {
        setSelectedText('');
        return;
      }
      if (!container.contains(selection.anchorNode)) {
        setSelectedText('');
        return;
      }
      setSelectedText(selection.toString());
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => { document.removeEventListener('selectionchange', onSelectionChange); };
  }, []);

  if (texts.error !== null) return <ErrorBanner error={texts.error} />;

  const passages = (texts.data?.items ?? [])
    .filter((t) => t.pageId === page.id)
    .sort((a, b) => a.ordinal - b.ordinal);

  const createNote = (text: string): void => {
    void notes.create({
      title: noteTitle, text,
      attachedTo: { images: [], texts: [] },
      derivedFrom: { kind: 'page', id: page.id },
    }).then(() => {
      setCreating(false);
      setSelectedText('');
      window.getSelection()?.removeAllRanges();
    });
  };

  return (
    <div className={styles['prose']}>
      <div className={styles['text']} ref={containerRef} data-testid="page-prose-text">
        {passages.map((passage) => (
          <div key={passage.ref.id} data-testid={`passage-${passage.ref.id}`}>
            {splitSentences(passage.text).map((sentence, index) => (
              // Sentences have no stable id of their own — an index is fine,
              // the list is display-only and never reordered.
              <p key={`${passage.ref.id}-${String(index)}`} className={styles['sentence']}>{sentence}</p>
            ))}
          </div>
        ))}
      </div>

      {notes.error !== null ? <ErrorBanner error={notes.error} /> : null}

      {selectedText.trim() === '' || creating ? null : (
        <button className={styles['createButton']} type="button" onClick={() => { setCreating(true); }}>
          Créer une note
        </button>
      )}

      {!creating ? null : (
        <NoteEditor
          initialText={selectedText}
          onCreate={createNote}
          onCancel={() => { setCreating(false); }}
          isPending={notes.isPending}
          error={notes.error}
        />
      )}
    </div>
  );
}
