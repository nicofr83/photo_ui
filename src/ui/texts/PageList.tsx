import { useState } from 'react';

import { usePages } from '../../api/hooks/usePages';
import { useDocuments } from '../../api/hooks/useTexts';
import { dateRangeFor, EMPTY_TEXT_FILTERS, type TextFilterState } from '../../domain/textFilterState';
import { matchesSearch } from '../../domain/searchFold';
import { sortPagesByDate, sortPagesByOrdinal } from '../../domain/pageOrder';
import { sourceOf, TextSource } from '../../domain/textSource';
import { ResolvedDateView } from '../date/ResolvedDate';
import { ErrorBanner } from '../primitives/ErrorBanner';

import { PageCard } from './PageCard';
import styles from './PageList.module.css';

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
  if (source === TextSource.WEB) return <WebDocuments q={filters.q} />;
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

function WebDocuments({ q }: { readonly q: string | null }): React.JSX.Element {
  const documents = useDocuments();

  if (documents.error !== null) return <ErrorBanner error={documents.error} />;
  if (documents.isPending) return <p role="status">Chargement des documents…</p>;

  // Wiring (v1.5, post-plan): the web source has no per-passage list (Task
  // 8's own scope, spec: a document is a "page" here) — `q` narrows the
  // DOCUMENT list by title, the data already in hand, rather than a full
  // passage search with no results surface to render into yet.
  const webDocs = documents.data.items
    .filter((d) => sourceOf(d.id) === TextSource.WEB)
    .filter((d) => q === null || q === '' || matchesSearch(d.title, q));

  return (
    <div>
      {/* Spec §5.3: the web site has no scan at all — not a per-document
          check, true of the whole source. */}
      <p className={styles['noPages']} data-testid="no-pages">
        Cette source n’a pas de page scannée en regard.
      </p>
      <ul className={styles['list']} aria-label="Documents du site web">
        {webDocs.map((doc) => (
          <li className={styles['docRow']} key={doc.id} data-testid={`doc-${doc.id}`}>
            <span className={styles['label']}>{doc.title}</span>
            <span>{doc.passageCount} passage{doc.passageCount > 1 ? 's' : ''}</span>
            {doc.span === null ? null : <ResolvedDateView date={doc.span} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
