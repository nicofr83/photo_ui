import type { PhotoPage } from '../../api/hooks/usePhotos';

import styles from './SelectionHeader.module.css';

interface Props {
  readonly page: PhotoPage;
  readonly selectedCount: number;
  readonly onSelectAll: () => void;
}

const plural = (n: number, one: string, many: string): string =>
  `${String(n)} ${n > 1 ? many : one}`;

/**
 * Spec §7.3 and §6.5: the count of what the filter set aside is displayed
 * whenever a filter is active, and "select all" says what it will act on.
 */
export function SelectionHeader({
  page,
  selectedCount,
  onSelectAll,
}: Props): React.JSX.Element {
  return (
    <div className={styles['header']} data-testid="selection-header">
      <div className={styles['counts']}>
        <span>{plural(page.total, 'résultat', 'résultats')}</span>
        <span>{plural(selectedCount, 'sélectionnée', 'sélectionnées')}</span>
        {page.excludedCount > 0 ? (
          <span className={styles['excluded']} data-testid="excluded-count">
            {plural(page.excludedCount, 'écartée par le filtre', 'écartées par le filtre')}
          </span>
        ) : null}
      </div>

      {page.total > 0 ? (
        <button className={styles['selectAll']} type="button" onClick={onSelectAll}>
          Sélectionner {page.total > 1 ? 'les' : 'le'}{' '}
          {plural(page.total, 'résultat', 'résultats')}
        </button>
      ) : null}

      {page.filters.unmatchedValues.length > 0 ? (
        <p className={styles['unmatched']} data-testid="unmatched-values">
          Aucune correspondance pour :{' '}
          {page.filters.unmatchedValues.map((v) => `${v.parameter} = ${v.value}`).join(', ')}
        </p>
      ) : null}
    </div>
  );
}
