import { useNotes } from '../../api/hooks/useNotes';
import { usePages } from '../../api/hooks/usePages';
import { useDocuments } from '../../api/hooks/useTexts';
import type { TextDocument, TextPage, TextUnit } from '../../api/contract/text';
import { attributionTitle, formatYearSpan } from '../../domain/noteTitle';
import { sourceOf, TextSource } from '../../domain/textSource';
import { ErrorBanner } from '../primitives/ErrorBanner';

import styles from './NoteFromTextButton.module.css';

interface Props {
  readonly slug: string;
  readonly selected: readonly TextUnit[];
}

function buildTitle(
  first: TextUnit,
  pages: readonly TextPage[],
  documents: readonly TextDocument[],
): string {
  const source = sourceOf(first.documentId);
  if (source === TextSource.WEB) {
    const doc = documents.find((d) => d.id === first.documentId);
    return attributionTitle({
      source: TextSource.WEB,
      documentTitle: doc?.title ?? first.documentId,
      span: doc?.span === null || doc?.span === undefined
        ? null
        : formatYearSpan(doc.span.start, doc.span.end),
    });
  }
  const page = first.pageId === null ? undefined : pages.find((p) => p.id === first.pageId);
  return attributionTitle({
    source,
    ordinal: page?.ordinal ?? first.ordinal,
    date: page?.date === null || page?.date === undefined ? null : page.date.start,
  });
}

/**
 * v1.5, Task 11: "on coche un ou plusieurs textes, un bouton fabrique une
 * note qui recopie le texte" (spec). Never coches the originals back —
 * sending the same words into both `journal.md`/`ma-vie.md` AND a note
 * would read to the LLM as two independent sources agreeing.
 *
 * The button never waits on `usePages`/`useDocuments` before allowing the
 * click: in real use it always mounts beside `PageDetail`, which already
 * fetched the same `documentId` (TanStack Query dedupes the request), so
 * the title is correct in practice; on a cold cache `buildTitle` degrades
 * to the text's own ordinal/date rather than blocking the create action —
 * the note stays editable afterwards either way.
 */
export function NoteFromTextButton({ slug, selected }: Props): React.JSX.Element | null {
  const notes = useNotes(slug);
  const first = selected[0];
  const pages = usePages(first?.documentId ?? '');
  const documents = useDocuments();

  if (first === undefined) return null;

  const create = (): void => {
    void notes.create({
      title: buildTitle(first, pages.data?.items ?? [], documents.data?.items ?? []),
      text: selected.map((unit) => unit.text).join('\n\n'),
      attachedTo: { images: [], texts: selected.map((unit) => unit.ref) },
      derivedFrom: first.ref,
    });
  };

  return (
    <div className={styles['wrap']}>
      {notes.error !== null ? <ErrorBanner error={notes.error} /> : null}
      <button className={styles['button']} type="button" disabled={notes.isPending} onClick={create}>
        Créer une note
      </button>
    </div>
  );
}
