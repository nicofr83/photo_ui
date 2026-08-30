import { usePageThumb } from '../../api/hooks/usePageThumb';
import type { TextPage } from '../../api/contract/text';
import { widthDays } from '../../domain/interval';
import { PageSpanSource } from '../../shared/enums';
import { ResolvedDateView } from '../date/ResolvedDate';

import styles from './PageCard.module.css';

interface Props {
  readonly page: TextPage;
  readonly onOpen: (pageId: string) => void;
}

const SUSPECT_WINDOW_DAYS = 60;

/**
 * Self-review, plan: "Douze pages du registre couvrent plus de soixante
 * jours... deux signes pointent vers une année mal lue à la transcription.
 * Ces pages portent un signe discret." Scoped to `spanSource: 'entries'` —
 * the register-derived window, the one this specific data-quality issue is
 * about; a wide `carried` window has an entirely different, benign cause.
 * `widthDays` reads this page's own two dates — not the forbidden
 * cross-entity overlap computation, just this one record's own span.
 */
function isSuspectWindow(page: TextPage): boolean {
  return page.spanSource === PageSpanSource.ENTRIES
    && page.window !== null
    && widthDays(page.window) > SUSPECT_WINDOW_DAYS;
}

/**
 * Spec §5.3: one row of the page list — date, thumbnail, number. `data-ordinal`
 * carries the notebook order for the sort-toggle test; it is not otherwise
 * visible chrome.
 */
export function PageCard({ page, onOpen }: Props): React.JSX.Element {
  return (
    <li className={styles['row']} data-testid={`page-${page.id}`} data-ordinal={page.ordinal}>
      <button className={styles['open']} type="button" onClick={() => { onOpen(page.id); }}>
        <img
          className={styles['thumb']}
          src={usePageThumb(page.id)}
          alt={`Page ${page.label ?? String(page.ordinal)}`}
          width={80}
        />
        <span className={styles['label']}>page {page.ordinal}</span>
        <ResolvedDateView date={page.date} />
        {/* Filled only under `q` (contract, back's Task 14) — never `0`
            standing in for "no search active". */}
        {page.matchCount === null ? null : (
          <span className={styles['matches']} data-testid="match-count">
            {page.matchCount} correspondance{page.matchCount > 1 ? 's' : ''}
          </span>
        )}
        {isSuspectWindow(page) ? (
          <span
            className={styles['suspect']}
            data-testid="suspect-window"
            title="Fenêtre de registre inhabituellement large — date peut-être mal lue à la transcription"
          >
            ⚠
          </span>
        ) : null}
      </button>
    </li>
  );
}
