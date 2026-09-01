import type { TextPage } from '../../api/contract/text';
import { attributionTitle } from '../../domain/noteTitle';
import { TextSource } from '../../domain/textSource';

import { PageProse } from './PageProse';
import { PageViewer } from './PageViewer';
import styles from './MaVieReader.module.css';

interface Props {
  readonly page: TextPage;
  readonly slug: string;
}

/**
 * Spec, "« Ma vie »": a récit, not a registre — the page image large, its
 * passages gathered into one free-selection reading zone below
 * (`PageProse`, the same component the journal's own prose now shares,
 * Nicolas's ruling 2026-09-01).
 */
export function MaVieReader({ page, slug }: Props): React.JSX.Element {
  const noteTitle = attributionTitle({
    source: TextSource.MA_VIE, ordinal: page.ordinal, date: page.date?.start ?? null,
  });

  return (
    <div className={styles['reader']}>
      <PageViewer page={page} large />
      <PageProse page={page} slug={slug} noteTitle={noteTitle} />
    </div>
  );
}
