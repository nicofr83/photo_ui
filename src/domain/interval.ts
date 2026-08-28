import type { IsoDate } from '../shared/date_interface';

export interface DayInterval {
  readonly start: IsoDate;
  readonly end: IsoDate;
}

const MS_PER_DAY = 86_400_000;

/**
 * Spec §4.1: two intervals overlap iff `Pd ≤ Tf` AND `Td ≤ Pf`.
 *
 * `YYYY-MM-DD` strings compare lexicographically in chronological order, so no
 * `Date` is built here — which also means no timezone can creep in (spec §9.6.5,
 * and the logbook's own timezone is unknown).
 */
export function overlaps(a: DayInterval, b: DayInterval): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/**
 * Present ONLY so the test suite can demonstrate that filtering does not use it.
 * Spec §7.3: on the measured case `2000-12-01 → 2000-12-20`, a containment
 * reading returns 0 photos where overlap returns 273.
 *
 * Never call this from application code.
 */
export function contains(outer: DayInterval, inner: DayInterval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

/** Inclusive width in whole civil days. A single day is 1, never 0. */
export function widthDays(i: DayInterval): number {
  const start = Date.parse(`${i.start}T00:00:00Z`);
  const end = Date.parse(`${i.end}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error(`malformed interval: ${i.start}..${i.end}`);
  }
  return Math.round((end - start) / MS_PER_DAY) + 1;
}
