import { isIsoDate } from '../shared/date_interface';
import { PhotoScope, PhotoSort, TextKind } from '../shared/enums';

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

  /** Contract §4.2, T3's search axes — all OPEN except the three booleans. */
  readonly tags: readonly string[];
  readonly people: readonly string[];
  readonly countries: readonly string[];
  readonly cities: readonly string[];
  readonly hasPosition: boolean;
  readonly hasOcr: boolean;
  readonly hasCaption: boolean;
  /** Full text. `null` and `''` are the same thing: neither is sent. */
  readonly q: string | null;

  /**
   * The "which photos does this text cover?" axis (contract §4.2). Set by
   * TextsScreen's "show photos" action, never by the filter panel — but it
   * lives in the URL like every other axis, for the same reason: a filter not
   * in the URL can disappear without anyone noticing.
   */
  readonly overlapsText: { readonly kind: TextKind; readonly id: string } | null;
}

export const EMPTY_FILTERS: FilterState = {
  dateFrom: null,
  dateTo: null,
  albumPaths: [],
  scope: PhotoScope.HIERARCHY,
  sort: PhotoSort.DATE_ASC,
  reliableDatesOnly: false,
  tags: [],
  people: [],
  countries: [],
  cities: [],
  hasPosition: false,
  hasOcr: false,
  hasCaption: false,
  q: null,
  overlapsText: null,
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

  for (const tag of state.tags) params.append('tag', tag);
  for (const person of state.people) params.append('person', person);
  for (const country of state.countries) params.append('country', country);
  for (const city of state.cities) params.append('city', city);
  if (state.hasPosition) params.set('hasPosition', 'true');
  if (state.hasOcr) params.set('hasOcr', 'true');
  if (state.hasCaption) params.set('hasCaption', 'true');
  if (state.q !== null && state.q !== '') params.set('q', state.q);

  // Contract §4.2: "les deux ensemble ou aucun" — the state never holds one
  // without the other, so there is nothing to guard here.
  if (state.overlapsText !== null) {
    params.set('overlapsTextKind', state.overlapsText.kind);
    params.set('overlapsTextId', state.overlapsText.id);
  }

  return params;
}

/** Anything the contract does not define is dropped here, never forwarded. */
export function fromSearchParams(params: URLSearchParams): FilterState {
  const rawFrom = params.get('dateFrom');
  const rawTo = params.get('dateTo');
  const bothEnds = rawFrom !== null && rawTo !== null && isIsoDate(rawFrom) && isIsoDate(rawTo);

  const scope = params.get('scope');
  const sort = params.get('sort');

  const rawKind = params.get('overlapsTextKind');
  const rawId = params.get('overlapsTextId');
  const overlapsText =
    rawKind !== null && rawId !== null && isMember(TextKind, rawKind)
      ? { kind: rawKind, id: rawId }
      : null;

  return {
    dateFrom: bothEnds ? rawFrom : null,
    dateTo: bothEnds ? rawTo : null,
    albumPaths: params.getAll('albumPath').map((p) => p.normalize('NFC')),
    scope: isMember(PhotoScope, scope) ? scope : PhotoScope.HIERARCHY,
    sort: isMember(PhotoSort, sort) ? sort : PhotoSort.DATE_ASC,
    reliableDatesOnly: params.get('reliableDatesOnly') === 'true',
    tags: params.getAll('tag'),
    people: params.getAll('person'),
    countries: params.getAll('country'),
    cities: params.getAll('city'),
    hasPosition: params.get('hasPosition') === 'true',
    hasOcr: params.get('hasOcr') === 'true',
    hasCaption: params.get('hasCaption') === 'true',
    q: params.get('q'),
    overlapsText,
  };
}

function isMember<T extends Record<string, string>>(
  vocabulary: T,
  value: string | null,
): value is T[keyof T] {
  return value !== null && Object.values(vocabulary).includes(value);
}

export type FilterAxis =
  | 'dates' | 'albumPath' | 'scope' | 'reliableDatesOnly' | 'overlapsText'
  | 'tag' | 'person' | 'country' | 'city' | 'hasPosition' | 'hasOcr' | 'hasCaption' | 'q';

/** A label a person can read, without knowing the wire vocabulary. */
const TEXT_KIND_LABEL: Record<TextKind, string> = {
  [TextKind.PASSAGE]: 'passage',
  [TextKind.LOG_ENTRY]: 'entrée de journal',
  [TextKind.WEB_CAPTION]: 'légende de galerie',
};

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

  for (const tag of state.tags) {
    tokens.push({
      axis: 'tag', label: tag,
      remove: (s) => ({ ...s, tags: s.tags.filter((t) => t !== tag) }),
    });
  }
  for (const person of state.people) {
    tokens.push({
      axis: 'person', label: person,
      remove: (s) => ({ ...s, people: s.people.filter((p) => p !== person) }),
    });
  }
  for (const country of state.countries) {
    tokens.push({
      axis: 'country', label: country,
      remove: (s) => ({ ...s, countries: s.countries.filter((c) => c !== country) }),
    });
  }
  for (const city of state.cities) {
    tokens.push({
      axis: 'city', label: city,
      remove: (s) => ({ ...s, cities: s.cities.filter((c) => c !== city) }),
    });
  }
  if (state.hasPosition) {
    tokens.push({
      axis: 'hasPosition', label: 'avec position',
      remove: (s) => ({ ...s, hasPosition: false }),
    });
  }
  if (state.hasOcr) {
    tokens.push({
      axis: 'hasOcr', label: 'avec texte détecté',
      remove: (s) => ({ ...s, hasOcr: false }),
    });
  }
  if (state.hasCaption) {
    tokens.push({
      axis: 'hasCaption', label: 'avec légende',
      remove: (s) => ({ ...s, hasCaption: false }),
    });
  }
  if (state.q !== null && state.q !== '') {
    tokens.push({
      axis: 'q', label: `« ${state.q} »`,
      remove: (s) => ({ ...s, q: null }),
    });
  }

  if (state.overlapsText !== null) {
    tokens.push({
      axis: 'overlapsText',
      label: `texte : ${TEXT_KIND_LABEL[state.overlapsText.kind]}`,
      remove: (s) => ({ ...s, overlapsText: null }),
    });
  }

  return tokens;
}
