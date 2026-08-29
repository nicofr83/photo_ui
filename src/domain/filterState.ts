import { isIsoDate } from '../shared/date_interface';
import { PhotoScope, PhotoSort } from '../shared/enums';

/**
 * The selection axes of tranche 1.
 *
 * This lives in the URL rather than in a store, deliberately: a filter that is
 * not in the URL is a filter that can disappear without anyone noticing, and
 * spec §6.5 forbids exactly that. It also makes a filtered view reloadable and
 * shareable for free.
 */
export interface FilterState {
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly albumPaths: readonly string[];
  readonly scope: PhotoScope;
  readonly sort: PhotoSort;
  /** Spec §6.1: OFF by default. Doubt includes. */
  readonly reliableDatesOnly: boolean;
}

export const EMPTY_FILTERS: FilterState = {
  dateFrom: null,
  dateTo: null,
  albumPaths: [],
  scope: PhotoScope.HIERARCHY,
  sort: PhotoSort.DATE_ASC,
  reliableDatesOnly: false,
};

/**
 * Emits ONLY parameter names the contract accepts. An unknown name is a 400,
 * so building the query anywhere else would risk a request the server refuses
 * — or worse, one it silently ignores.
 */
export function toSearchParams(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();

  // A half-open range is not a range: the contract wants both ends or neither.
  if (state.dateFrom !== null && state.dateTo !== null) {
    params.set('dateFrom', state.dateFrom);
    params.set('dateTo', state.dateTo);
  }

  for (const path of state.albumPaths) {
    // Contract §1: every string crossing the API is NFC.
    params.append('albumPath', path.normalize('NFC'));
  }

  if (state.scope !== PhotoScope.HIERARCHY) params.set('scope', state.scope);
  if (state.sort !== PhotoSort.DATE_ASC) params.set('sort', state.sort);
  if (state.reliableDatesOnly) params.set('reliableDatesOnly', 'true');

  return params;
}

/** Anything the contract does not define is dropped here, never forwarded. */
export function fromSearchParams(params: URLSearchParams): FilterState {
  const rawFrom = params.get('dateFrom');
  const rawTo = params.get('dateTo');
  const bothEnds = rawFrom !== null && rawTo !== null && isIsoDate(rawFrom) && isIsoDate(rawTo);

  const scope = params.get('scope');
  const sort = params.get('sort');

  return {
    dateFrom: bothEnds ? rawFrom : null,
    dateTo: bothEnds ? rawTo : null,
    albumPaths: params.getAll('albumPath').map((p) => p.normalize('NFC')),
    scope: isMember(PhotoScope, scope) ? scope : PhotoScope.HIERARCHY,
    sort: isMember(PhotoSort, sort) ? sort : PhotoSort.DATE_ASC,
    reliableDatesOnly: params.get('reliableDatesOnly') === 'true',
  };
}

function isMember<T extends Record<string, string>>(
  vocabulary: T,
  value: string | null,
): value is T[keyof T] {
  return value !== null && Object.values(vocabulary).includes(value);
}

export type FilterAxis = 'dates' | 'albumPath' | 'scope' | 'reliableDatesOnly';

export interface FilterToken {
  readonly axis: FilterAxis;
  readonly label: string;
  /** Clears exactly this axis. Spec §6.5: every active filter is removable. */
  readonly remove: (state: FilterState) => FilterState;
}

export function activeFilterTokens(state: FilterState): FilterToken[] {
  const tokens: FilterToken[] = [];

  if (state.dateFrom !== null && state.dateTo !== null) {
    tokens.push({
      axis: 'dates',
      label: `du ${state.dateFrom} au ${state.dateTo}`,
      remove: (s) => ({ ...s, dateFrom: null, dateTo: null }),
    });
  }

  for (const path of state.albumPaths) {
    tokens.push({
      axis: 'albumPath',
      label: path,
      remove: (s) => ({ ...s, albumPaths: s.albumPaths.filter((p) => p !== path) }),
    });
  }

  if (state.scope !== PhotoScope.HIERARCHY) {
    tokens.push({
      axis: 'scope',
      label: state.scope === PhotoScope.ALL ? 'toute la photothèque' : 'hors hiérarchie',
      remove: (s) => ({ ...s, scope: PhotoScope.HIERARCHY }),
    });
  }

  if (state.reliableDatesOnly) {
    tokens.push({
      axis: 'reliableDatesOnly',
      label: 'dates fiables seulement',
      remove: (s) => ({ ...s, reliableDatesOnly: false }),
    });
  }

  return tokens;
}
