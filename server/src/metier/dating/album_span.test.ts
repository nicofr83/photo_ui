import { describe, expect, test } from 'vitest';

import { albumInterval, isSuspectedRange, parseAlbumPrefix } from './album_span.ts';

describe('parseAlbumPrefix', () => {
  test('reads YYYY-NN as a month when NN is a real month', () => {
    expect(parseAlbumPrefix('1998-02-Maison rose Algès')).toEqual({ year: 1998, month: 2 });
    expect(parseAlbumPrefix('1998-07 Famille Trotobas Lisbonne')).toEqual({ year: 1998, month: 7 });
    expect(parseAlbumPrefix('1999-12 Capvert Guadeloupe')).toEqual({ year: 1999, month: 12 });
  });

  test('NN > 12 is a trip number, not a month — year only', () => {
    expect(parseAlbumPrefix('2002-38Dec02')).toEqual({ year: 2002, month: null });
  });

  test('a bare year is a year', () => {
    expect(parseAlbumPrefix('2000')).toEqual({ year: 2000, month: null });
  });

  test('a second number in the name is not a month', () => {
    expect(parseAlbumPrefix('2000-06-2 Vierges Americaines')).toEqual({ year: 2000, month: 6 });
  });

  test('a name with no prefix yields nothing rather than a guess', () => {
    expect(parseAlbumPrefix('Chapon à trier')).toEqual({ year: null, month: null });
  });
});

describe('albumInterval', () => {
  test('a month prefix gives the WHOLE month, presumed', () => {
    expect(albumInterval('2000-12-viree au Venezuela-3mois', null)).toEqual({
      from: '2000-12-01', to: '2000-12-31', presumed: true, precision: 'month',
    });
  });

  test('a year-only prefix gives the whole year, presumed', () => {
    expect(albumInterval('2002-38Dec02', null)).toEqual({
      from: '2002-01-01', to: '2002-12-31', presumed: true, precision: 'year',
    });
  });

  test('February is 28 or 29 days, never 30 — the month is a real month', () => {
    expect(albumInterval('1998-02-Maison rose Algès', null)?.to).toBe('1998-02-28');
    expect(albumInterval('2000-02-Saint Bart', null)?.to).toBe('2000-02-29');
  });

  test('a saisi span wins over the prefix and is NOT presumed', () => {
    expect(albumInterval('1998-02-Maison rose Algès', { from: '1998-02-01', to: '1999-06-30' }))
      .toEqual({ from: '1998-02-01', to: '1999-06-30', presumed: false, precision: 'month' });
  });

  test('a saisi span with ragged bounds is WIDENED to whole months, never narrowed', () => {
    expect(albumInterval('1998-02-Maison rose Algès', { from: '1998-02-15', to: '1999-06-20' }))
      .toEqual({ from: '1998-02-01', to: '1999-06-30', presumed: false, precision: 'month' });
  });

  test('a saisi span of a single day stays a day', () => {
    expect(albumInterval('1999-03 Maldives', { from: '1999-03-02', to: '1999-03-02' }))
      .toEqual({ from: '1999-03-02', to: '1999-03-02', presumed: false, precision: 'day' });
  });

  test('an album whose name carries no date has no interval — nothing is invented', () => {
    expect(albumInterval('Chapon à trier', null)).toBeNull();
  });
});

describe('isSuspectedRange — an aid to SORTING the settings screen, never a date source', () => {
  test('an explicit duration counts', () => {
    expect(isSuspectedRange('2000-12-viree au Venezuela-3mois')).toBe(true);
  });

  test('two toponyms count', () => {
    expect(isSuspectedRange('2004-01- Fort Lauderdale - Belize')).toBe(true);
    expect(isSuspectedRange('2003-11-Sorel-Beaufort-Fort Lauderdale')).toBe(true);
  });

  test('a single place does not', () => {
    expect(isSuspectedRange('2000-01-guadeloupe')).toBe(false);
    expect(isSuspectedRange('2003-02-Cap Canaveral')).toBe(false);
  });
});
