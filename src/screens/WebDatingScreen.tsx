import { useState } from 'react';

import { useWebDocuments } from '../api/hooks/useWebSpan';
import { WebDocumentScope } from '../shared/enums';
import { ErrorBanner } from '../ui/primitives/ErrorBanner';
import { FixedHeader } from '../ui/primitives/FixedHeader';
import scrollStyles from '../ui/primitives/FixedHeader.module.css';
import { WebDocRow } from '../ui/webdating/WebDocRow';

import styles from './WebDatingScreen.module.css';

/**
 * v1.5, Task 12: "ce qui ouvre 2003-2004" — the site's own pages carry no
 * date at all, and this is the only screen that gives them one. Scoped to
 * the perimeter by default (contract §4.8: 28 of 60 documents); the rest —
 * templates, the Google-verification file, off-topic scans — sit behind
 * "Voir tout" rather than being hidden outright.
 */
export function WebDatingScreen(): React.JSX.Element {
  const [scope, setScope] = useState<WebDocumentScope>(WebDocumentScope.PERIMETER);
  const documents = useWebDocuments(scope);

  if (documents.error !== null) return <ErrorBanner error={documents.error} />;
  if (documents.isPending) return <p role="status">Chargement…</p>;

  return (
    <section className={styles['screen']}>
      <FixedHeader>
        <h1>Datation du site</h1>
      </FixedHeader>
      <div className={scrollStyles['scrolls']}>
        {scope === WebDocumentScope.PERIMETER ? (
          <button
            className={styles['showAll']}
            type="button"
            onClick={() => { setScope(WebDocumentScope.ALL); }}
          >
            Voir tout
          </button>
        ) : null}

        <ul className={styles['list']} aria-label="Documents du site web">
          {documents.data.items.map((row) => (
            <WebDocRow key={row.documentId} row={row} />
          ))}
        </ul>
      </div>
    </section>
  );
}
