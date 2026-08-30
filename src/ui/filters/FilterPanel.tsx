import { useEffect, useState } from 'react';

import { useAlbums } from '../../api/hooks/useAlbums';
import { usePhotoFacets } from '../../api/hooks/usePhotoFacets';
import type { FacetBucket } from '../../api/contract/photo';
import { sortAlbumsByPath } from '../../domain/albumOrder';
import {
  activeFilterTokens, toSearchParams, type FilterState,
} from '../../domain/filterState';
import { firstDayOfMonth, lastDayOfMonth, toMonthInput } from '../../domain/monthRange';
import { PhotoSort } from '../../shared/enums';

import styles from './FilterPanel.module.css';

interface Props {
  readonly filters: FilterState;
  readonly onChange: (next: FilterState) => void;
}

const SORT_LABELS: Record<PhotoSort, string> = {
  [PhotoSort.DATE_ASC]: 'Date croissante',
  [PhotoSort.DATE_DESC]: 'Date décroissante',
  [PhotoSort.AESTHETICS_DESC]: 'Score esthétique',
  [PhotoSort.ALBUM]: 'Album puis nom de fichier',
  [PhotoSort.OVERLAP]: 'Recouvrement le plus serré',
};

/** Toggles `value` in one of the array axes — tags, people, countries, cities. */
function toggled(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function FilterPanel({ filters, onChange }: Props): React.JSX.Element {
  const albums = useAlbums();
  const sortedAlbums = albums.data === undefined ? [] : sortAlbumsByPath(albums.data.items);
  // Contract §5.4: same filter parameters as /photos, a separate call.
  const facets = usePhotoFacets(toSearchParams(filters));
  const tokens = activeFilterTokens(filters);

  /**
   * The two month inputs are typed one at a time, but `dateFrom`/`dateTo`
   * only ever reach the URL TOGETHER — a half-open range means nothing to
   * `/photos` (confirmed against the real backend: a lone `dateFrom` is
   * silently ignored, `filters.applied` stays empty). Deriving each input's
   * value straight from `filters` made completing a range structurally
   * impossible: committing the FIRST month typed round-trips through
   * `toSearchParams`/`fromSearchParams` with the other bound still `null`,
   * which drops it — the second month can never rescue what the first
   * already lost. Local draft state holds a partial edit until BOTH are
   * complete, then commits once, atomically. Bug found live: typing into
   * either field never produced any visible value at all.
   */
  const [draftFrom, setDraftFrom] = useState(toMonthInput(filters.dateFrom));
  const [draftTo, setDraftTo] = useState(toMonthInput(filters.dateTo));

  // Sync down when the pair changes from OUTSIDE this input pair — the ×
  // token on the active-filter chip, or a fresh navigation. Never fights a
  // keystroke: nothing echoes back from `filters` until a commit below
  // actually happens.
  useEffect(() => {
    setDraftFrom(toMonthInput(filters.dateFrom));
    setDraftTo(toMonthInput(filters.dateTo));
  }, [filters.dateFrom, filters.dateTo]);

  const commitDates = (from: string, to: string): void => {
    const start = firstDayOfMonth(from);
    const end = lastDayOfMonth(to);
    if (start !== null && end !== null) onChange({ ...filters, dateFrom: start, dateTo: end });
  };

  const toggleAlbum = (path: string) => {
    const next = filters.albumPaths.includes(path)
      ? filters.albumPaths.filter((p) => p !== path)
      : [...filters.albumPaths, path];
    onChange({ ...filters, albumPaths: next });
  };

  // 0 ⇒ the place axis is disabled, with its reason — spec §5.4/T3.
  const placeDisabled = (facets.data?.positionedCount ?? 1) === 0;

  return (
    <div className={styles['panel']}>
      {tokens.length > 0 ? (
        <span className={styles['badge']} data-testid="active-filter-count">
          {tokens.length}
        </span>
      ) : null}

      {tokens.length > 0 ? (
        <ul className={styles['tokens']}>
          {tokens.map((token) => (
            <li
              className={styles['token']}
              key={`${token.axis}:${token.label}`}
              data-testid={`filter-token-${token.axis}`}
            >
              {token.label}
              <button
                className={styles['remove']}
                type="button"
                aria-label={`Retirer le filtre ${token.label}`}
                onClick={() => { onChange(token.remove(filters)); }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <label className={styles['field']}>
        Rechercher
        <input
          className={styles['control']}
          type="search"
          value={filters.q ?? ''}
          onChange={(e) => { onChange({ ...filters, q: e.target.value === '' ? null : e.target.value }); }}
        />
      </label>

      <fieldset className={styles['group']}>
        <legend className={styles['legend']}>Période</legend>
        <label className={styles['field']}>
          Premier mois
          <input
            className={styles['control']}
            type="month"
            value={draftFrom}
            onChange={(e) => { setDraftFrom(e.target.value); commitDates(e.target.value, draftTo); }}
          />
        </label>
        <label className={styles['field']}>
          Dernier mois
          <input
            className={styles['control']}
            type="month"
            value={draftTo}
            onChange={(e) => { setDraftTo(e.target.value); commitDates(draftFrom, e.target.value); }}
          />
        </label>
        <p className={styles['note']}>
          Une photo est retenue dès que son intervalle chevauche la période.
        </p>
      </fieldset>

      <fieldset className={styles['group']}>
        <legend className={styles['legend']}>Fiabilité</legend>
        <label className={styles['album']}>
          <input
            type="checkbox"
            checked={filters.reliableDatesOnly}
            onChange={(e) => { onChange({ ...filters, reliableDatesOnly: e.target.checked }); }}
          />
          Dates fiables seulement
        </label>
        <p className={styles['note']} data-testid="reliable-dates-warning">
          Écarte les photos datées au mois ou à l’année. Désactivé par défaut : le
          doute inclut.
        </p>
      </fieldset>

      <fieldset className={styles['group']}>
        <legend className={styles['legend']}>Tri</legend>
        <label className={styles['field']}>
          Trier par
          <select
            className={styles['control']}
            value={filters.sort}
            onChange={(e) => {
              // Validate rather than assert: an unknown value must not reach the
              // server, where it would be a 400.
              const chosen = Object.values(PhotoSort).find((s) => s === e.target.value);
              if (chosen !== undefined) onChange({ ...filters, sort: chosen });
            }}
          >
            {Object.values(PhotoSort).map((sort) => (
              <option key={sort} value={sort}>{SORT_LABELS[sort]}</option>
            ))}
          </select>
        </label>
        <p className={styles['note']} data-testid="sort-note">
          Les photos sans date sont groupées à la fin.
        </p>
      </fieldset>

      <fieldset className={styles['group']}>
        <legend className={styles['legend']}>Albums</legend>
        <div className={styles['albums']}>
          {sortedAlbums.map((album) => (
            <label className={styles['album']} key={album.path} data-testid={`album-${album.path}`}>
              <input
                type="checkbox"
                checked={filters.albumPaths.includes(album.path)}
                onChange={() => { toggleAlbum(album.path); }}
              />
              <span className={styles['albumText']}>
                {/* The prefix is NEVER rendered as a date (spec §3.2): the name is
                    shown as the person typed it. The full path, not just the leaf
                    (`album.albumName` alone) — the sort is on the path, and an
                    album name does not always carry its own year: without the
                    parent set visible, the order looks arbitrary. */}
                <span>{album.path}</span>
                <span className={styles['count']}>({album.photoCount})</span>
                {album.suspectedRange ? (
                  <span className={styles['suspect']}>couvre peut-être une plage</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Contract §5.4: sorted by selectivity — the rarest tag first. The 42
          over 500 photos are never hidden, only de-emphasised (spec §7.3). */}
      <fieldset className={styles['group']}>
        <legend className={styles['legend']}>Tags</legend>
        <div className={styles['albums']}>
          {facets.data?.tags.map((bucket) => (
            <BucketCheckbox
              key={bucket.value}
              bucket={bucket}
              checked={filters.tags.includes(bucket.value)}
              deemphasised={bucket.tooBroad === true}
              onToggle={() => { onChange({ ...filters, tags: toggled(filters.tags, bucket.value) }); }}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className={styles['group']}>
        <legend className={styles['legend']}>Personnes</legend>
        <div className={styles['albums']}>
          {facets.data?.people.map((bucket) => (
            <BucketCheckbox
              key={bucket.value}
              bucket={bucket}
              checked={filters.people.includes(bucket.value)}
              onToggle={() => { onChange({ ...filters, people: toggled(filters.people, bucket.value) }); }}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className={styles['group']} disabled={placeDisabled}>
        <legend className={styles['legend']}>Lieu</legend>
        {placeDisabled ? (
          <p className={styles['note']} data-testid="place-disabled-reason">
            Aucune photo du filtre courant n’a de position.
          </p>
        ) : (
          <p className={styles['note']}>
            Repli sur le nom d’album ou de groupe quand la photo n’a pas de lieu EXIF.
          </p>
        )}
        <div className={styles['albums']}>
          {facets.data?.countries.map((bucket) => (
            <BucketCheckbox
              key={bucket.value}
              bucket={bucket}
              checked={filters.countries.includes(bucket.value)}
              disabled={placeDisabled}
              onToggle={() => {
                onChange({ ...filters, countries: toggled(filters.countries, bucket.value) });
              }}
            />
          ))}
          {facets.data?.cities.map((bucket) => (
            <BucketCheckbox
              key={bucket.value}
              bucket={bucket}
              checked={filters.cities.includes(bucket.value)}
              disabled={placeDisabled}
              onToggle={() => { onChange({ ...filters, cities: toggled(filters.cities, bucket.value) }); }}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className={styles['group']}>
        <legend className={styles['legend']}>Autres critères</legend>
        <label className={styles['album']}>
          <input
            type="checkbox"
            checked={filters.hasPosition}
            onChange={(e) => { onChange({ ...filters, hasPosition: e.target.checked }); }}
          />
          Avec position
        </label>
        <label className={styles['album']}>
          <input
            type="checkbox"
            checked={filters.hasOcr}
            onChange={(e) => { onChange({ ...filters, hasOcr: e.target.checked }); }}
          />
          Avec texte détecté dans l’image
          {facets.data === undefined ? null : ` (${String(facets.data.withOcrCount)})`}
        </label>
        <label className={styles['album']}>
          <input
            type="checkbox"
            checked={filters.hasCaption}
            onChange={(e) => { onChange({ ...filters, hasCaption: e.target.checked }); }}
          />
          Avec légende
        </label>
      </fieldset>
    </div>
  );
}

function BucketCheckbox({
  bucket, checked, onToggle, deemphasised = false, disabled = false,
}: {
  readonly bucket: FacetBucket;
  readonly checked: boolean;
  readonly onToggle: () => void;
  readonly deemphasised?: boolean;
  readonly disabled?: boolean;
}): React.JSX.Element {
  return (
    <label
      className={[styles['album'], deemphasised ? styles['broad'] : null].filter(Boolean).join(' ')}
    >
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
      <span>{bucket.value}</span>
      <span className={styles['count']}>({bucket.count})</span>
    </label>
  );
}
