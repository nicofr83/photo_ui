import { usePageThumb } from '../../api/hooks/usePageThumb';
import type { TextPage } from '../../api/contract/text';
import { ResolvedDateView } from '../date/ResolvedDate';

import styles from './PageCard.module.css';

interface Props {
  readonly page: TextPage;
  readonly onOpen: (pageId: string) => void;
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
      </button>
    </li>
  );
}
