import { useAlbums } from '../../api/hooks/useAlbums';
import {
  activeFilterTokens, type FilterState,
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

export function FilterPanel({ filters, onChange }: Props): React.JSX.Element {
  const albums = useAlbums();
  const tokens = activeFilterTokens(filters);

  const setMonth = (edge: 'from' | 'to') => (value: string) => {
    const day = edge === 'from' ? firstDayOfMonth(value) : lastDayOfMonth(value);
    onChange(edge === 'from' ? { ...filters, dateFrom: day } : { ...filters, dateTo: day });
  };

  const toggleAlbum = (path: string) => {
    const next = filters.albumPaths.includes(path)
      ? filters.albumPaths.filter((p) => p !== path)
      : [...filters.albumPaths, path];
    onChange({ ...filters, albumPaths: next });
  };

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

      <fieldset className={styles['group']}>
        <legend className={styles['legend']}>Période</legend>
        <label className={styles['field']}>
          Premier mois
          <input
            className={styles['control']}
            type="month"
            value={toMonthInput(filters.dateFrom)}
            onChange={(e) => { setMonth('from')(e.target.value); }}
          />
        </label>
        <label className={styles['field']}>
          Dernier mois
          <input
            className={styles['control']}
            type="month"
            value={toMonthInput(filters.dateTo)}
            onChange={(e) => { setMonth('to')(e.target.value); }}
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
          {albums.data?.items.map((album) => (
            <label className={styles['album']} key={album.path} data-testid={`album-${album.path}`}>
              <input
                type="checkbox"
                checked={filters.albumPaths.includes(album.path)}
                onChange={() => { toggleAlbum(album.path); }}
              />
              {/* The prefix is NEVER rendered as a date (spec §3.2): the name is
                  shown as the person typed it. */}
              <span>{album.albumName}</span>
              <span className={styles['count']}>({album.photoCount})</span>
              {album.suspectedRange ? (
                <span className={styles['suspect']}>couvre peut-être une plage</span>
              ) : null}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
