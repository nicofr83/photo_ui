import { describe, expect, test } from 'vitest';

import { DatePrecision, DateSource } from '@shared/enums';
import type { AlbumInterval } from './album_span.ts';
import { resolveCascade, type CascadeInput } from './cascade.ts';

const december2000: AlbumInterval =
  { from: '2000-12-01', to: '2000-12-31', presumed: true, precision: 'month' };
const year2002: AlbumInterval =
  { from: '2002-01-01', to: '2002-12-31', presumed: true, precision: 'year' };
const base: CascadeInput = { captureDateLocal: null, album: null, annotationDate: null, proposal: null };

describe('the six ranks', () => {
  test('rank 1 — a hand-typed date wins unconditionally, and is a DAY', () => {
    const r = resolveCascade({ ...base, album: december2000,
      captureDateLocal: '2017-04-11T09:15:00', annotationDate: '1999-03-02' });
    expect(r.resolvedFrom).toBe(DateSource.ANNOTATION);
    expect(r.resolvedStart).toBe('1999-03-02');
    expect(r.resolvedEnd).toBe('1999-03-02');
    expect(r.resolvedPrecision).toBe(DatePrecision.DAY);
  });

  test('rank 1 still records the arbitration — the hand contradicting the EXIF stays visible', () => {
    const r = resolveCascade({ ...base, album: december2000,
      captureDateLocal: '2017-04-11T09:15:00', annotationDate: '1999-03-02' });
    expect(r.arbitrationOutcome).toBe('rejected');
    expect(r.arbitrationGapMonths).toBe(196);
  });

  test('rank 2 — an EXIF inside the window is a READING, to the day', () => {
    const r = resolveCascade({ ...base, album: december2000, captureDateLocal: '2000-12-14T10:22:03' });
    expect(r.resolvedFrom).toBe(DateSource.EXIF_ARBITRATED);
    expect(r.resolvedStart).toBe('2000-12-14');
    expect(r.resolvedPrecision).toBe(DatePrecision.DAY);
    expect(r.arbitrationOutcome).toBe('accepted');
  });

  test('rank 3 — a logbook-bracket proposal carries its bracket AND its evidence', () => {
    const r = resolveCascade({ ...base, album: december2000,
      captureDateLocal: '2017-04-11T09:15:00',
      proposal: { date: '2000-12-20', dateSource: 'logbook-bracket', spanHours: 407.75,
                  evidenceEntryIds: ['logbook/p003/019', 'logbook/p004/003'] } });
    expect(r.resolvedFrom).toBe(DateSource.LOGBOOK_BRACKET);
    expect(r.resolvedStart).toBe('2000-12-20');
    expect(r.bracketHours).toBe(407.75);
    expect(r.evidenceEntryIds).toEqual(['logbook/p003/019', 'logbook/p004/003']);
  });

  test('rank 3 loses to rank 2 — a reading beats a proposal', () => {
    const r = resolveCascade({ ...base, album: december2000, captureDateLocal: '2000-12-14T10:22:03',
      proposal: { date: '2000-12-20', dateSource: 'logbook-bracket', spanHours: 407.75,
                  evidenceEntryIds: ['logbook/p003/019'] } });
    expect(r.resolvedFrom).toBe(DateSource.EXIF_ARBITRATED);
    expect(r.bracketHours).toBeNull();
  });

  test('rank 4 — a 2017 scan date is rejected and the album takes over, at MONTH precision', () => {
    const r = resolveCascade({ ...base, album: december2000, captureDateLocal: '2017-04-11T09:15:00' });
    expect(r.resolvedFrom).toBe(DateSource.ALBUM_MONTH);
    expect(r.resolvedStart).toBe('2000-12-01');
    expect(r.resolvedEnd).toBe('2000-12-31');
    expect(r.resolvedPrecision).toBe(DatePrecision.MONTH);
    expect(r.arbitrationOutcome).toBe('rejected');
  });

  test('rank 5 — no EXIF at all: same interval as rank 4, but NO arbitration block', () => {
    const r = resolveCascade({ ...base, album: december2000 });
    expect(r.resolvedFrom).toBe(DateSource.ALBUM_MONTH);
    expect(r.resolvedStart).toBe('2000-12-01');
    expect(r.arbitrationOutcome).toBeNull();
    expect(r.arbitrationGapMonths).toBeNull();
  });

  test('rank 4 and rank 5 are DISTINGUISHABLE — that is what the block is for', () => {
    const rank4 = resolveCascade({ ...base, album: december2000, captureDateLocal: '2017-04-11T09:15:00' });
    const rank5 = resolveCascade({ ...base, album: december2000 });
    expect(rank4.resolvedFrom).toBe(rank5.resolvedFrom);
    expect(rank4.arbitrationOutcome).not.toBe(rank5.arbitrationOutcome);
  });

  test('rank 6 — a year-only album gives the whole YEAR', () => {
    const r = resolveCascade({ ...base, album: year2002 });
    expect(r.resolvedFrom).toBe(DateSource.ALBUM_YEAR);
    expect(r.resolvedStart).toBe('2002-01-01');
    expect(r.resolvedEnd).toBe('2002-12-31');
    expect(r.resolvedPrecision).toBe(DatePrecision.YEAR);
  });

  test('rank 5 with a single-day saisi album span resolves at DAY precision', () => {
    const singleDay: AlbumInterval =
      { from: '1999-03-02', to: '1999-03-02', presumed: false, precision: 'day' };
    const r = resolveCascade({ ...base, album: singleDay });
    expect(r.resolvedFrom).toBe(DateSource.ALBUM_MONTH);
    expect(r.resolvedStart).toBe('1999-03-02');
    expect(r.resolvedEnd).toBe('1999-03-02');
    expect(r.resolvedPrecision).toBe(DatePrecision.DAY);
  });
});

describe('the rank-3 gate — a manual proposal is a DECISION, never an inference', () => {
  test('dateSource "manual" is NOT rank 3 — it falls through to the album', () => {
    const r = resolveCascade({ ...base, album: december2000,
      proposal: { date: '2000-12-20', dateSource: 'manual', spanHours: 436.5,
                  evidenceEntryIds: ['logbook/p003/019'] } });
    expect(r.resolvedFrom).toBe(DateSource.ALBUM_MONTH);
    expect(r.bracketHours).toBeNull();
    expect(r.evidenceEntryIds).toEqual([]);
  });

  test('a manual proposal never beats a rejected EXIF either — same fall-through as no proposal', () => {
    const withManual = resolveCascade({ ...base, album: december2000,
      captureDateLocal: '2017-04-11T09:15:00',
      proposal: { date: '2000-12-20', dateSource: 'manual', spanHours: null, evidenceEntryIds: [] } });
    const withoutProposal = resolveCascade({ ...base, album: december2000,
      captureDateLocal: '2017-04-11T09:15:00' });
    expect(withManual).toEqual(withoutProposal);
  });

  test('an unrecognised dateSource is ALSO refused at rank 3 — closed to exactly one value, not open', () => {
    const r = resolveCascade({ ...base, album: december2000,
      proposal: { date: '2000-12-20', dateSource: 'proposed', spanHours: null, evidenceEntryIds: [] } });
    expect(r.resolvedFrom).toBe(DateSource.ALBUM_MONTH);
  });
});

describe('the edges', () => {
  test('no album, no EXIF, nothing at all — a null date, never an invented one', () => {
    const r = resolveCascade(base);
    expect(r.resolvedFrom).toBeNull();
    expect(r.resolvedStart).toBeNull();
    expect(r.resolvedEnd).toBeNull();
    expect(r.resolvedPrecision).toBeNull();
  });

  test('no album but an EXIF — dated by the EXIF, with nothing to arbitrate against', () => {
    const r = resolveCascade({ ...base, captureDateLocal: '2003-06-07T14:02:55' });
    expect(r.resolvedFrom).toBe(DateSource.EXIF_ARBITRATED);
    expect(r.resolvedStart).toBe('2003-06-07');
    expect(r.arbitrationOutcome).toBeNull();
  });

  test('a logbook-bracket proposal without evidence still dates the photo, and says it has no bracket', () => {
    const r = resolveCascade({ ...base, album: december2000,
      proposal: { date: '2000-12-20', dateSource: 'logbook-bracket', spanHours: null, evidenceEntryIds: [] } });
    expect(r.resolvedFrom).toBe(DateSource.LOGBOOK_BRACKET);
    expect(r.bracketHours).toBeNull();
    expect(r.evidenceEntryIds).toEqual([]);
  });

  test('bracketHours is NEVER set outside rank 3 — the CHECK would refuse it anyway', () => {
    expect(resolveCascade({ ...base, album: december2000 }).bracketHours).toBeNull();
    expect(resolveCascade({ ...base, album: december2000,
      captureDateLocal: '2000-12-14T10:22:03' }).bracketHours).toBeNull();
  });

  test('every rank produces bounds that are BOTH set or BOTH null', () => {
    const inputs: CascadeInput[] = [
      base,
      { ...base, album: december2000 },
      { ...base, album: year2002 },
      { ...base, album: december2000, captureDateLocal: '2000-12-14T10:22:03' },
      { ...base, album: december2000, annotationDate: '1999-03-02' },
    ];
    for (const input of inputs) {
      const r = resolveCascade(input);
      expect(r.resolvedStart === null).toBe(r.resolvedEnd === null);
      expect(r.resolvedStart === null).toBe(r.resolvedFrom === null);
    }
  });
});
