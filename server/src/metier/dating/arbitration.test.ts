import { describe, expect, test } from 'vitest';

import type { AlbumInterval } from './album_span.ts';
import { arbitrate, monthsBetween } from './arbitration.ts';

const december2000: AlbumInterval =
  { from: '2000-12-01', to: '2000-12-31', presumed: true, precision: 'month' };
const year2002: AlbumInterval =
  { from: '2002-01-01', to: '2002-12-31', presumed: true, precision: 'year' };

describe('monthsBetween — whole months, because an album does not claim a day', () => {
  test('same month is zero', () => { expect(monthsBetween('2000-12-04', '2000-12-28')).toBe(0); });
  test('counts calendar months, not 30-day blocks', () => {
    expect(monthsBetween('2000-12-31', '2001-01-01')).toBe(1);
    expect(monthsBetween('2000-12-01', '2001-06-30')).toBe(6);
  });
  test('is unsigned — a gap is a distance', () => {
    expect(monthsBetween('2001-06-01', '2000-12-01')).toBe(6);
  });
});

describe('arbitrate', () => {
  test('no EXIF at all is rank 5, and says so with null — never a gap of 0', () => {
    expect(arbitrate(null, december2000)).toBeNull();
  });

  test('an EXIF inside the album month is accepted with a gap of 0', () => {
    expect(arbitrate('2000-12-14T10:22:03', december2000))
      .toEqual({ outcome: 'accepted', gapMonths: 0, exifDay: '2000-12-14' });
  });

  test('an EXIF 3 months out is still accepted — the window is 6 months each side', () => {
    expect(arbitrate('2001-03-02T08:00:00', december2000))
      .toEqual({ outcome: 'accepted', gapMonths: 3, exifDay: '2001-03-02' });
  });

  test('exactly 6 months is inside the window', () => {
    expect(arbitrate('2001-06-15T08:00:00', december2000)?.outcome).toBe('accepted');
  });

  test('7 months is outside', () => {
    expect(arbitrate('2001-07-15T08:00:00', december2000)?.outcome).toBe('rejected');
  });

  test('a 2017 scan date in a 2000 album is REJECTED, and the gap is kept', () => {
    const result = arbitrate('2017-04-11T09:15:00', december2000);
    expect(result?.outcome).toBe('rejected');
    expect(result?.gapMonths).toBe(196);
  });

  test('for a year-only album the window is the YEAR, not six months', () => {
    expect(arbitrate('2002-11-30T12:00:00', year2002)?.outcome).toBe('accepted');
    expect(arbitrate('2003-01-02T12:00:00', year2002)?.outcome).toBe('rejected');
  });

  test('the six upstream captureDate formats all parse to the same civil day', () => {
    for (const raw of ['2000-12-14T11:42:23', '2000-12-14T11:42:23Z',
                       '2000-12-14T11:42:23.36', '2000-12-14T11:42:23.000Z',
                       '2000-12-14T11:42:23+02:00', '2000-12-14T11:42:23.780+04:00']) {
      expect(arbitrate(raw, december2000)?.exifDay).toBe('2000-12-14');
    }
  });
});
