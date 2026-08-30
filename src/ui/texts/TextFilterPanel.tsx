import { useEffect, useState } from 'react';

import { useDocuments } from '../../api/hooks/useTexts';
import { useTextFacets } from '../../api/hooks/useTextFacets';
import {
  withoutDateFilter, withRange, withYears, type TextFilterState,
} from '../../domain/textFilterState';
import { TextSource } from '../../domain/textSource';
import { isIsoDate } from '../../shared/date_interface';
import { ErrorBanner } from '../primitives/ErrorBanner';

import styles from './TextFilterPanel.module.css';

interface Props {
  readonly source: TextSource;
  readonly filters: TextFilterState;
  readonly onChange: (next: TextFilterState) => void;
}

/**
 * v1.5, Task 10: the Textes screen's own filter column — spec "Les filtres".
 * Not wired into `TextsScreen` by this task (its file list names only this
 * component, `textFilterState.ts` and `useTextFacets.ts` — integration is a
 * later task's concern).
 */
export function TextFilterPanel({ source, filters, onChange }: Props): React.JSX.Element {
  const q = filters.q ?? '';

  const search = (
    <label className={styles['field']}>
      Rechercher un texte
      <input
        className={styles['control']}
        type="search"
        value={q}
        onChange={(event) => {
          const next = event.target.value;
          onChange({ ...filters, q: next === '' ? null : next });
        }}
      />
    </label>
  );

  // Spec: "tant qu'aucune date n'est saisie, le bloc des filtres de date est
  // désactivé et dit pourquoi" — true of the whole web source today, and
  // there is no single document to ask facets of (60 of them), so this is
  // a fixed fact rather than a fetch.
  if (source === TextSource.WEB) {
    return (
      <div className={styles['panel']}>
        {search}
        <p className={styles['disabledReason']} data-testid="dates-disabled-reason">
          Aucun texte du site n’est daté : le filtre par date est désactivé.
        </p>
      </div>
    );
  }

  return (
    <div className={styles['panel']}>
      {search}
      <DateAxis source={source} filters={filters} onChange={onChange} />
    </div>
  );
}

function DateAxis({
  source, filters, onChange,
}: {
  readonly source: TextSource;
  readonly filters: TextFilterState;
  readonly onChange: (next: TextFilterState) => void;
}): React.JSX.Element {
  const documents = useDocuments();
  const facets = useTextFacets(source);
  const [draftFrom, setDraftFrom] = useState(filters.from ?? '');
  const [draftTo, setDraftTo] = useState(filters.to ?? '');

  // Never fights a keystroke: syncs FROM the committed state only, same
  // pattern as the images filter panel's date range.
  useEffect(() => {
    setDraftFrom(filters.from ?? '');
    setDraftTo(filters.to ?? '');
  }, [filters.from, filters.to]);

  if (facets.error !== null) return <ErrorBanner error={facets.error} />;
  if (documents.error !== null) return <ErrorBanner error={documents.error} />;
  if (facets.isPending || documents.isPending) return <p role="status">Chargement des filtres…</p>;

  const document = documents.data.items.find((d) => d.id === source);
  const datedCount = facets.data.years.reduce((sum, bucket) => sum + bucket.count, 0);
  const excludedCount = document === undefined ? 0 : document.passageCount - datedCount;
  const dateFilterActive = filters.years.length > 0 || (filters.from !== null && filters.to !== null);

  const commitRange = (from: string, to: string): void => {
    if (isIsoDate(from) && isIsoDate(to)) onChange(withRange(filters, from, to));
  };

  return (
    <fieldset className={styles['dateAxis']}>
      <legend>Par date</legend>

      <ul className={styles['years']} aria-label="Années">
        {facets.data.years.map((bucket) => (
          <li key={bucket.value} data-testid={`year-${bucket.value}`}>
            <label>
              <input
                type="checkbox"
                checked={filters.years.includes(bucket.value)}
                onChange={() => {
                  const next = filters.years.includes(bucket.value)
                    ? filters.years.filter((y) => y !== bucket.value)
                    : [...filters.years, bucket.value];
                  onChange(withYears(filters, next));
                }}
              />
              {bucket.value}
            </label>
          </li>
        ))}
      </ul>

      <label className={styles['field']}>
        Du
        <input
          className={styles['control']}
          type="date"
          value={draftFrom}
          onChange={(event) => {
            setDraftFrom(event.target.value);
            commitRange(event.target.value, draftTo);
          }}
        />
      </label>
      <label className={styles['field']}>
        Au
        <input
          className={styles['control']}
          type="date"
          value={draftTo}
          onChange={(event) => {
            setDraftTo(event.target.value);
            commitRange(draftFrom, event.target.value);
          }}
        />
      </label>

      {!dateFilterActive || excludedCount <= 0 ? null : (
        <p className={styles['excluded']}>
          <span data-testid="excluded-count">{excludedCount}</span>
          {' '}texte{excludedCount > 1 ? 's' : ''} sans date écarté{excludedCount > 1 ? 's' : ''}.
          {' '}
          <button
            className={styles['include']}
            type="button"
            onClick={() => { onChange(withoutDateFilter(filters)); }}
          >
            Inclure les textes sans date
          </button>
        </p>
      )}
    </fieldset>
  );
}
