import { usePages } from '../../api/hooks/usePages';
import { useTexts } from '../../api/hooks/useTexts';
import { useTextSelection } from '../../api/hooks/useTextSelection';
import type { TextRef } from '../../api/contract/text';
import { attributionTitle } from '../../domain/noteTitle';
import { TextSource } from '../../domain/textSource';
import { TextKind } from '../../shared/enums';
import { ErrorBanner } from '../primitives/ErrorBanner';

import { JournalTable } from './JournalTable';
import { PageViewer } from './PageViewer';
import styles from './PageDetail.module.css';
import { TextCard } from './TextCard';

interface Props {
  readonly pageId: string;
  readonly slug: string;
  readonly onShowPhotos?: (ref: TextRef) => void;
}

const key = (ref: TextRef): string => `${ref.kind}:${ref.id}`;

/**
 * V1.7, spec "le journal de bord": the registre becomes a table
 * (`JournalTable`) — the page image large (2/3 of the viewport), the list
 * of pages gone while a page is open.
 *
 * OPEN QUESTION, flagged to team-lead: the spec only reworks the registre
 * (`log_entry`) — it says nothing about the journal's free-prose passages
 * (`passage`, ~492 across the corpus, distinct from the 1012 registre
 * lines). Kept exactly as before (plain `TextCard` cards, the old task-
 * selection checkbox) below the table until this is settled — nothing
 * disappears either way.
 */
export function JournalPageDetail({ pageId, slug, onShowPhotos }: Props): React.JSX.Element {
  const documentId = pageId.slice(0, pageId.lastIndexOf('/'));
  const pages = usePages(documentId);
  const texts = useTexts(documentId);
  const selection = useTextSelection(slug);

  if (pages.error !== null) return <ErrorBanner error={pages.error} />;
  if (pages.isPending) return <p role="status">Chargement de la page…</p>;

  const page = pages.data.items.find((p) => p.id === pageId);
  if (page === undefined) return <p role="alert">Page introuvable ({pageId}).</p>;

  const forThisPage = texts.data?.items.filter((t) => t.pageId === pageId) ?? [];
  const registre = forThisPage
    .filter((t) => t.ref.kind === TextKind.LOG_ENTRY)
    .sort((a, b) => a.ordinal - b.ordinal);
  const passages = forThisPage.filter((t) => t.ref.kind !== TextKind.LOG_ENTRY);

  const noteTitle = attributionTitle({
    source: TextSource.LOGBOOK, ordinal: page.ordinal, date: page.date?.start ?? null,
  });

  return (
    <div className={styles['detail']}>
      <div className={styles['texts']}>
        <PageViewer page={page} large />

        {texts.error !== null ? <ErrorBanner error={texts.error} /> : null}

        {registre.length === 0 ? null : (
          <JournalTable units={registre} slug={slug} noteTitle={noteTitle} />
        )}

        {passages.length === 0 ? null : (
          <section data-testid="block-notes">
            {passages.map((unit) => (
              <TextCard
                key={key(unit.ref)}
                unit={unit}
                {...(onShowPhotos === undefined ? {} : { onShowPhotos })}
                selected={selection.selected.has(key(unit.ref))}
                onToggleSelect={() => {
                  void (selection.selected.has(key(unit.ref))
                    ? selection.remove([unit.ref])
                    : selection.add([unit.ref]));
                }}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
