import { usePages } from '../../api/hooks/usePages';
import { useTexts } from '../../api/hooks/useTexts';
import type { TextRef } from '../../api/contract/text';
import { attributionTitle } from '../../domain/noteTitle';
import { TextSource } from '../../domain/textSource';
import { TextKind } from '../../shared/enums';
import { ErrorBanner } from '../primitives/ErrorBanner';

import { JournalTable } from './JournalTable';
import { PageProse } from './PageProse';
import { PageViewer } from './PageViewer';
import styles from './PageDetail.module.css';

interface Props {
  readonly pageId: string;
  readonly slug: string;
  /** Nicolas's ruling (2026-09-01): passed through to `JournalTable` only
   * — the registre's rows get it back, the prose zone below never does
   * (see `JournalRow`'s doc comment for why). */
  readonly onShowPhotos?: (ref: TextRef) => void;
}

/**
 * V1.7, spec "le journal de bord", Nicolas's ruling (2026-09-01): a page,
 * two zones, each according to its content's own nature. "Registre" — the
 * table (`JournalTable`), structured and dated, one line = one note. "Prose
 * de la page" — free-running text, the same treatment as "Ma vie"
 * (`PageProse`, shared by both): highlight what you want, cut where you
 * want. The page image sits above both, once (2/3 of the viewport).
 *
 * These exact section words were shown to Nicolas and approved — kept
 * verbatim.
 */
export function JournalPageDetail({ pageId, slug, onShowPhotos }: Props): React.JSX.Element {
  const documentId = pageId.slice(0, pageId.lastIndexOf('/'));
  const pages = usePages(documentId);
  const texts = useTexts(documentId, TextKind.LOG_ENTRY);

  if (pages.error !== null) return <ErrorBanner error={pages.error} />;
  if (pages.isPending) return <p role="status">Chargement de la page…</p>;

  const page = pages.data.items.find((p) => p.id === pageId);
  if (page === undefined) return <p role="alert">Page introuvable ({pageId}).</p>;

  const registre = (texts.data?.items ?? [])
    .filter((t) => t.pageId === pageId)
    .sort((a, b) => a.ordinal - b.ordinal);

  const noteTitle = attributionTitle({
    source: TextSource.LOGBOOK, ordinal: page.ordinal, date: page.date?.start ?? null,
  });

  return (
    <div className={styles['detail']}>
      <div className={styles['texts']}>
        <PageViewer page={page} large />

        {texts.error !== null ? <ErrorBanner error={texts.error} /> : null}

        {registre.length === 0 ? null : (
          <section>
            <h2>Registre</h2>
            <JournalTable
              units={registre}
              slug={slug}
              noteTitle={noteTitle}
              {...(onShowPhotos === undefined ? {} : { onShowPhotos })}
            />
          </section>
        )}

        <section>
          <h2>Prose de la page</h2>
          <PageProse page={page} slug={slug} noteTitle={noteTitle} />
        </section>
      </div>
    </div>
  );
}
