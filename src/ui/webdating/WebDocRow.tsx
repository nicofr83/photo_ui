import { useState } from 'react';

import { useWebSpan } from '../../api/hooks/useWebSpan';
import type { WebDocumentRow } from '../../api/contract/ref';
import { isIsoDate } from '../../shared/date_interface';
import { ResolvedDateView } from '../date/ResolvedDate';
import { ErrorBanner } from '../primitives/ErrorBanner';

import { DateProposal } from './DateProposal';
import styles from './WebDocRow.module.css';

interface Props {
  readonly row: WebDocumentRow;
}

/**
 * v1.5, Task 12: one row of the web-dating screen — title, excerpt, the
 * path as a hint, the current span (if one was already saved — always an
 * inference, contract §4.8), the proposal beside it, and a field that starts
 * empty regardless (same "current value shown read-only, the form starts
 * blank" convention as the album span editor). A single START bound only —
 * the end is derived server-side.
 */
export function WebDocRow({ row }: Props): React.JSX.Element {
  const editor = useWebSpan();
  const [dateFrom, setDateFrom] = useState('');
  const [note, setNote] = useState('');

  const save = (): void => {
    if (!isIsoDate(dateFrom)) return;
    void editor.save({ documentId: row.documentId, dateFrom, note: note === '' ? null : note })
      .then(() => { setDateFrom(''); setNote(''); })
      .catch(() => undefined);
  };

  return (
    <li className={styles['row']} data-testid={`web-doc-${row.documentId}`}>
      <p className={styles['title']}>{row.title}</p>
      <p className={styles['excerpt']}>{row.excerpt}</p>
      <p className={styles['hint']} data-testid="path-hint">Indice de date : {row.pathHint}</p>

      {row.span === null ? (
        <p className={styles['current']}>Aucune plage saisie.</p>
      ) : (
        <p className={styles['current']}><ResolvedDateView date={row.span} /></p>
      )}

      <DateProposal proposal={row.proposal} onAdopt={setDateFrom} />

      {editor.error !== null ? <ErrorBanner error={editor.error} /> : null}

      <div className={styles['form']}>
        <label className={styles['field']}>
          Premier jour
          <input
            className={styles['control']}
            type="date"
            value={dateFrom}
            onChange={(event) => { setDateFrom(event.target.value); }}
          />
        </label>
        <label className={styles['field']}>
          Note
          <input
            className={styles['control']}
            type="text"
            value={note}
            onChange={(event) => { setNote(event.target.value); }}
          />
        </label>
        <button
          className={styles['button']}
          type="button"
          disabled={editor.isPending || dateFrom === ''}
          onClick={save}
        >
          Enregistrer
        </button>
      </div>
    </li>
  );
}
