import { useEffect, useRef, useState } from 'react';

import { useNotes } from '../../api/hooks/useNotes';
import { useTexts } from '../../api/hooks/useTexts';
import type { TextPage } from '../../api/contract/text';
import { attributionTitle } from '../../domain/noteTitle';
import { splitSentences } from '../../domain/sentenceSplit';
import { TextSource } from '../../domain/textSource';
import { TextKind } from '../../shared/enums';
import { ErrorBanner } from '../primitives/ErrorBanner';
import { NoteEditor } from '../notes/NoteEditor';
import { PageViewer } from './PageViewer';

import styles from './MaVieReader.module.css';

interface Props {
  readonly page: TextPage;
  readonly slug: string;
}

/**
 * Spec, "« Ma vie »": a récit, not a registre — its passages gathered into
 * ONE reading zone, in page order, one sentence per line
 * (`domain/sentenceSplit`, a display heuristic only — the stored text never
 * changes). Highlighting a non-empty selection surfaces "Créer une note",
 * which opens the same shared editor as the journal, prefilled with
 * whatever was selected — retours à la ligne compris (spec: it is precisely
 * why the "modifié" comparison normalizes whitespace).
 *
 * `derivedFrom` names the whole PAGE, never a passage: a free selection can
 * cover two passages or half of one (spec, "la sélection libre").
 */
export function MaVieReader({ page, slug }: Props): React.JSX.Element {
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

  const noteTitle = attributionTitle({
    source: TextSource.MA_VIE, ordinal: page.ordinal, date: page.date?.start ?? null,
  });

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
    <div className={styles['reader']}>
      <PageViewer page={page} large />

      <div className={styles['text']} ref={containerRef} data-testid="ma-vie-text">
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
