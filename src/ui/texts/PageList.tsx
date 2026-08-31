import { useState } from 'react';

import { usePages } from '../../api/hooks/usePages';
import { useWebDocuments } from '../../api/hooks/useWebSpan';
import { dateRangeFor, EMPTY_TEXT_FILTERS, type TextFilterState } from '../../domain/textFilterState';
import { matchesSearch } from '../../domain/searchFold';
import { sortPagesByDate, sortPagesByOrdinal } from '../../domain/pageOrder';
import { TextSource } from '../../domain/textSource';
import { ErrorBanner } from '../primitives/ErrorBanner';

import { PageCard } from './PageCard';
import styles from './PageList.module.css';
import { WebDocCard } from './WebDocCard';

interface Props {
  readonly source: TextSource;
  readonly onOpen: (pageId: string) => void;
  /** Wiring (v1.5, post-plan): optional so every existing caller/test that
   * only cares about source/onOpen keeps working unfiltered. */
  readonly filters?: TextFilterState;
}

type Order = 'date' | 'ordinal';

function orderKey(source: TextSource): string {
  return `photo_ui:page-order:${source}`;
}

function readOrder(source: TextSource): Order {
  try {
    return localStorage.getItem(orderKey(source)) === 'ordinal' ? 'ordinal' : 'date';
  } catch {
    return 'date';
  }
}

function writeOrder(source: TextSource, order: Order): void {
  try {
    localStorage.setItem(orderKey(source), order);
  } catch {
    // Losing the memorized toggle is not worth a crash.
  }
}

/**
 * v1.5, Task 8: the page list for the active source. `logbook`/`ma-vie` map
 * 1:1 to a single document (their id IS the source string) — the web source
 * has 60 documents instead, and no scan at all, so it lists documents rather
 * than pages (spec §5.3).
 */
export function PageList({ source, onOpen, filters = EMPTY_TEXT_FILTERS }: Props): React.JSX.Element {
  if (source === TextSource.WEB) return <WebDocuments q={filters.q} onOpen={onOpen} />;
  return <DocumentPages documentId={source} source={source} onOpen={onOpen} filters={filters} />;
}

function DocumentPages({
  documentId, source, onOpen, filters,
}: {
  readonly documentId: string;
  readonly source: TextSource;
  readonly onOpen: (pageId: string) => void;
  readonly filters: TextFilterState;
}): React.JSX.Element {
  const range = dateRangeFor(filters);
  const pages = usePages(documentId, {
    ...(range === null ? {} : range),
    ...(filters.q === null || filters.q === '' ? {} : { q: filters.q }),
  });
  const [order, setOrder] = useState<Order>(() => readOrder(source));

  if (pages.error !== null) return <ErrorBanner error={pages.error} />;
  if (pages.isPending) return <p role="status">Chargement des pages…</p>;

  const sorted = order === 'date'
    ? sortPagesByDate(pages.data.items)
    : sortPagesByOrdinal(pages.data.items);

  return (
    <div>
      <button
        className={styles['toggle']}
        type="button"
        onClick={() => {
          const next: Order = order === 'date' ? 'ordinal' : 'date';
          setOrder(next);
          writeOrder(source, next);
        }}
      >
        {order === 'date' ? 'Ordre du cahier' : 'Ordre chronologique'}
      </button>
      <ul className={styles['list']} aria-label="Pages">
        {sorted.map((page) => (
          <PageCard key={page.id} page={page} onOpen={onOpen} />
        ))}
      </ul>
    </div>
  );
}

function WebDocuments({
  q, onOpen,
}: {
  readonly q: string | null;
  readonly onOpen: (documentId: string) => void;
}): React.JSX.Element {
  // V1.6, Nicolas: "la liste des pages, avec une image de la page web" — the
  // richer row (`WebDocumentRow`, A11's `thumbSha256`), not the bare
  // `TextDocument` list Task 8 used. `PERIMETER` (default) matches every
  // other web-source screen: rebuts (a Google-verification file, empty
  // templates) are not worth reading either.
  const documents = useWebDocuments();

  if (documents.error !== null) return <ErrorBanner error={documents.error} />;
  if (documents.isPending) return <p role="status">Chargement des documents…</p>;

  const webDocs = documents.data.items
    .filter((d) => q === null || q === '' || matchesSearch(d.title, q));

  return (
    <div>
      {/* Spec §5.3: the web site has no scan at all — not a per-document
          check, true of the whole source. */}
      <p className={styles['noPages']} data-testid="no-pages">
        Cette source n’a pas de page scannée en regard.
      </p>
      <ul className={styles['list']} aria-label="Documents du site web">
        {webDocs.map((doc) => <WebDocCard key={doc.documentId} row={doc} onOpen={onOpen} />)}
      </ul>
    </div>
  );
}
