import { useState } from 'react';

import { usePages } from '../../api/hooks/usePages';
import { sortPagesByDate, sortPagesByOrdinal } from '../../domain/pageOrder';
import { TextSource } from '../../domain/textSource';
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
 * v1.5, Task 8: the page list for the logbook/"Ma vie" sources — they map
 * 1:1 to a single document (their id IS the source string). The web source
 * (V1.7) has its own five-page reader, `SiteWebReader`, and never calls
 * this — no filter, no thumbnail list left to build here for it.
 */
export function PageList({ source, onOpen }: Props): React.JSX.Element {
  const pages = usePages(source);
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
