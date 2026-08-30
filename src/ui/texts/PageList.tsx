import { useState } from 'react';

import { usePages } from '../../api/hooks/usePages';
import { useDocuments } from '../../api/hooks/useTexts';
import { sortPagesByDate, sortPagesByOrdinal } from '../../domain/pageOrder';
import { sourceOf, TextSource } from '../../domain/textSource';
import { ResolvedDateView } from '../date/ResolvedDate';
import { ErrorBanner } from '../primitives/ErrorBanner';

import { PageCard } from './PageCard';
import styles from './PageList.module.css';

interface Props {
  readonly source: TextSource;
  readonly onOpen: (pageId: string) => void;
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
export function PageList({ source, onOpen }: Props): React.JSX.Element {
  if (source === TextSource.WEB) return <WebDocuments />;
  return <DocumentPages documentId={source} source={source} onOpen={onOpen} />;
}

function DocumentPages({
  documentId, source, onOpen,
}: {
  readonly documentId: string;
  readonly source: TextSource;
  readonly onOpen: (pageId: string) => void;
}): React.JSX.Element {
  const pages = usePages(documentId);
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

function WebDocuments(): React.JSX.Element {
  const documents = useDocuments();

  if (documents.error !== null) return <ErrorBanner error={documents.error} />;
  if (documents.isPending) return <p role="status">Chargement des documents…</p>;

  const webDocs = documents.data.items.filter((d) => sourceOf(d.id) === TextSource.WEB);

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
