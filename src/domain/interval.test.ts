import { parseIsoDate } from '../shared/date_interface';

import { contains, overlaps, widthDays, type DayInterval } from './interval';

const interval = (start: string, end: string): DayInterval => ({
  start: parseIsoDate(start),
  end: parseIsoDate(end),
});

describe('INVARIANT §7.3 — an overlapping interval is kept, never "must be contained"', () => {
  // Measured case, spec §7.3: album `2000-12-viree au Venezuela-3mois` holds 243
  // photos dated to the month, interval [2000-12-01, 2000-12-31]. A strict
  // reading of the filter 2000-12-01 → 2000-12-20 returns 0 photos; overlap
  // returns 273. This is the second-largest album of the perimeter.
  const albumMonth = interval('2000-12-01', '2000-12-31');
  const fortnightFilter = interval('2000-12-01', '2000-12-20');

  test('the December album is kept by the first-fortnight filter', () => {
    expect(overlaps(albumMonth, fortnightFilter)).toBe(true);
  });

  test('a containment reading would have excluded it — this is why we never use it', () => {
    expect(contains(fortnightFilter, albumMonth)).toBe(false);
  });
});

describe('overlaps', () => {
  test('touching on a single day counts as overlapping', () => {
    expect(overlaps(interval('1999-01-01', '1999-01-10'), interval('1999-01-10', '1999-01-20')))
      .toBe(true);
  });
  test('one day apart does not overlap', () => {
    expect(overlaps(interval('1999-01-01', '1999-01-10'), interval('1999-01-11', '1999-01-20')))
      .toBe(false);
  });
  test('an interval overlaps itself', () => {
    const a = interval('2003-05-01', '2003-05-31');
    expect(overlaps(a, a)).toBe(true);
  });
  test('a single day inside a month overlaps it', () => {
    expect(overlaps(interval('1999-10-14', '1999-10-14'), interval('1999-10-01', '1999-10-31')))
      .toBe(true);
  });
  test('overlap is symmetric across the whole matrix', () => {
    const samples = [
      interval('1999-01-01', '1999-01-10'),
      interval('1999-01-05', '1999-02-05'),
      interval('1999-03-01', '1999-03-01'),
      interval('1998-01-01', '2004-12-31'),
    ];
    for (const a of samples) {
      for (const b of samples) {
        expect(overlaps(a, b)).toBe(overlaps(b, a));
      }
    }
  });
  test('a year-wide interval overlaps a day inside it', () => {
    expect(overlaps(interval('2000-01-01', '2000-12-31'), interval('2000-07-04', '2000-07-04')))
      .toBe(true);
  });
});

describe('contains — present only to demonstrate what we do not do', () => {
  test('is true when the inner interval fits entirely', () => {
    expect(contains(interval('1999-10-01', '1999-10-31'), interval('1999-10-14', '1999-10-14')))
      .toBe(true);
  });
  test('is false when the inner interval spills past the end', () => {
    expect(contains(interval('1999-10-01', '1999-10-20'), interval('1999-10-14', '1999-10-25')))
      .toBe(false);
  });
});

describe('widthDays — inclusive', () => {
  test('a single day is one day wide, never zero', () => {
    expect(widthDays(interval('1999-10-14', '1999-10-14'))).toBe(1);
  });
  test('a full October is 31 days wide', () => {
    expect(widthDays(interval('1999-10-01', '1999-10-31'))).toBe(31);
  });
  test('the longest measured logbook gap is 92 days', () => {
    expect(widthDays(interval('2001-06-05', '2001-09-04'))).toBe(92);
  });
  test('a leap year is 366 days wide', () => {
    expect(widthDays(interval('2000-01-01', '2000-12-31'))).toBe(366);
  });
  test('a span crossing a DST boundary is still counted in whole civil days', () => {
    // Europe/Paris springs forward on 2000-03-26. Counting in local time would
    // yield 30.958 days and round wrong; the logbook timezone is unknown anyway.
    expect(widthDays(interval('2000-03-01', '2000-03-31'))).toBe(31);
  });
});

describe('a malformed interval fails loudly rather than measuring nonsense', () => {
  test('widthDays rejects a bound that is not a civil day', () => {
    const malformed = { start: 'octobre 1999', end: '1999-10-31' } as unknown as DayInterval;
    expect(() => widthDays(malformed)).toThrow(/malformed interval/);
  });
});
