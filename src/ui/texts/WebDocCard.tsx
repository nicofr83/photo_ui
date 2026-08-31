import { useImageThumb } from '../../api/hooks/useImageThumb';
import type { WebDocumentRow } from '../../api/contract/ref';
import { ResolvedDateView } from '../date/ResolvedDate';

import styles from './WebDocCard.module.css';

interface Props {
  readonly row: WebDocumentRow;
  readonly onOpen: (documentId: string) => void;
}

/**
 * V1.6, Nicolas: "avoir la liste des pages, avec une image de la page web" —
 * a real photo (`row.proposal.thumbSha256`, A11), never a screenshot of the
 * HTML (the 60 pages share one FrontPage template and would all look
 * alike). `proposal` is a SUGGESTION, independent from `row.span` (the saved
 * `web_span`, Task 10) — this card shows the resolved span when one exists,
 * never the proposal's own date as though it had been applied.
 */
export function WebDocCard({ row, onOpen }: Props): React.JSX.Element {
  // Called unconditionally (rules-of-hooks) even though the src is only used
  // when `proposal` is non-null below.
  const thumbSrc = useImageThumb(row.proposal?.thumbSha256 ?? '');

  return (
    <li className={styles['row']} data-testid={`doc-${row.documentId}`}>
      <button className={styles['open']} type="button" onClick={() => { onOpen(row.documentId); }}>
        {row.proposal === null ? (
          <span className={styles['placeholder']} aria-hidden="true">·</span>
        ) : (
          <img className={styles['thumb']} src={thumbSrc} alt={row.title} width={48} />
        )}
        <span className={styles['label']}>{row.title}</span>
        <span className={styles['count']}>
          {row.passageCount} passage{row.passageCount > 1 ? 's' : ''}
        </span>
        {row.span === null ? null : <ResolvedDateView date={row.span} />}
      </button>
    </li>
  );
}
