import { isIsoDate } from '../shared/date_interface';

/**
 * v1.5, Task 10: the two date axes of the Textes screen's filters — a
 * multi-selection of whole years, or a single finer range — never both at
 * once (spec §"les filtres": "jamais les deux à la fois"). `source` is
 * deliberately NOT a field here: it already lives in TextsScreen's own
 * `?source=` (Task 8), and `TextFilterPanel` takes it as its own prop
 * (plan deviation — the plan's type signature lists `source` as a field,
 * but its own test passes it as a sibling prop, `filters` staying just the
 * date/text axes; folding it in would give the source two owners).
 */
export interface TextFilterState {
  readonly years: readonly string[];
  readonly from: string | null;
  readonly to: string | null;
  readonly q: string | null;
}

export const EMPTY_TEXT_FILTERS: TextFilterState = {
  years: [], from: null, to: null, q: null,
};

/** Years and a range are mutually exclusive — structural, not surveilled. */
export function withYears(state: TextFilterState, years: readonly string[]): TextFilterState {
  return { ...state, years: [...years], from: null, to: null };
}

export function withRange(state: TextFilterState, from: string, to: string): TextFilterState {
  return { ...state, years: [], from, to };
}

/** Clears the date axis entirely — "ramener" the texts a date filter excluded. */
export function withoutDateFilter(state: TextFilterState): TextFilterState {
  return { ...state, years: [], from: null, to: null };
}

export function toSearchParams(state: TextFilterState): URLSearchParams {
  const params = new URLSearchParams();
  for (const year of state.years) params.append('year', year);
  // A half-open range is not a range — same rule as the images filter panel
  // (domain/filterState.ts), the same defect it once had: a lone bound must
  // never reach the URL, or the second one can no longer rescue the first.
  if (state.from !== null && state.to !== null) {
    params.set('dateFrom', state.from);
    params.set('dateTo', state.to);
  }
  if (state.q !== null && state.q !== '') params.set('q', state.q);
  return params;
}

export function fromSearchParams(params: URLSearchParams): TextFilterState {
  const rawFrom = params.get('dateFrom');
  const rawTo = params.get('dateTo');
  const bothEnds = rawFrom !== null && rawTo !== null && isIsoDate(rawFrom) && isIsoDate(rawTo);
  const years = params.getAll('year');

  return {
    // Years and a range cannot both survive a round trip — a URL edited by
    // hand into holding both resolves to the range, the finer axis.
    years: bothEnds ? [] : years,
    from: bothEnds ? rawFrom : null,
    to: bothEnds ? rawTo : null,
    q: params.get('q'),
  };
}

/**
 * Wiring (v1.5, post-plan): `GET /pages` only ever takes ONE `dateFrom`/
 * `dateTo` pair (contract, Task 14) — no repeated `year`. A range collapses
 * straight through; a set of years collapses to its own SPAN (earliest
 * selected year's Jan 1 through the latest's Dec 31), never one server call
 * per year — "plusieurs plages simultanées" is explicitly out of the v1.5
 * plan's perimeter, and the real corpus's own years are contiguous runs
 * (logbook 1998-2002, ma-vie a single year), so this is exact for every
 * case the picker can actually produce, not just an approximation.
 */
export function dateRangeFor(state: TextFilterState): { dateFrom: string; dateTo: string } | null {
  if (state.years.length > 0) {
    const sorted = [...state.years].sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first === undefined || last === undefined) return null;
    return { dateFrom: `${first}-01-01`, dateTo: `${last}-12-31` };
  }
  if (state.from !== null && state.to !== null) return { dateFrom: state.from, dateTo: state.to };
  return null;
}
