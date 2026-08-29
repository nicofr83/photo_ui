import type { OverlapSummary } from '../api/contract/overlap';

import { describeOverlap } from './overlapSummary';

const summary = (over: Partial<OverlapSummary> = {}): OverlapSummary => ({
  matchCount: 87, windowDays: 41,
  datedToDayCount: 53, datedToMonthCount: 34, datedToYearCount: 0, undatedCount: 0,
  ...over,
});

describe('§4.3 — the counter says what the proposal is worth AND where it is weak', () => {
  test('the measured example from the spec, verbatim', () => {
    expect(describeOverlap(summary())).toBe(
      '87 photos dans une fenêtre de 41 jours, dont 34 datées au mois seulement',
    );
  });

  test('a single photo and a single day are not pluralised', () => {
    expect(describeOverlap(summary({
      matchCount: 1, windowDays: 1, datedToDayCount: 1, datedToMonthCount: 0,
    }))).toBe('1 photo dans une fenêtre de 1 jour');
  });

  test('when every photo is dated to the day, no weakness is claimed', () => {
    expect(describeOverlap(summary({ datedToMonthCount: 0, datedToDayCount: 87 })))
      .toBe('87 photos dans une fenêtre de 41 jours');
  });

  test('year-precision photos are counted in the weakness too', () => {
    expect(describeOverlap(summary({ datedToMonthCount: 4, datedToYearCount: 2 })))
      .toContain('dont 6 datées au mois ou à l’année seulement');
  });

  test('undated photos are named separately: they are a different problem', () => {
    expect(describeOverlap(summary({ datedToMonthCount: 0, undatedCount: 3 })))
      .toBe('87 photos dans une fenêtre de 41 jours, dont 3 sans date');
  });

  test('both weaknesses are reported together', () => {
    const text = describeOverlap(summary({ datedToMonthCount: 34, undatedCount: 3 }));
    expect(text).toContain('34 datées au mois seulement');
    expect(text).toContain('3 sans date');
  });

  test('an empty result says so plainly rather than showing zeroes', () => {
    expect(describeOverlap(summary({ matchCount: 0, datedToDayCount: 0, datedToMonthCount: 0 })))
      .toBe('aucune photo dans cette fenêtre');
  });
});
