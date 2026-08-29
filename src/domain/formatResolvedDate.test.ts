import { parseIsoDate, type DateArbitration, type ResolvedDate } from '../shared/date_interface';
import { DateKind, DatePrecision, DateSource } from '../shared/enums';

import { KindDisagreementError, expectedKindFor } from './dateKind';
import { formatResolvedDate } from './formatResolvedDate';

const ALL_SOURCES = Object.values(DateSource);
const ALL_PRECISIONS = Object.values(DatePrecision);

/** Builds a date whose kind always agrees with its source. */
function dateFrom(
  source: DateSource,
  precision: DatePrecision = DatePrecision.DAY,
  over: Partial<ResolvedDate> = {},
): ResolvedDate {
  const bounds = {
    [DatePrecision.DAY]: ['1999-10-14', '1999-10-14'],
    [DatePrecision.MONTH]: ['1999-10-01', '1999-10-31'],
    [DatePrecision.YEAR]: ['1999-01-01', '1999-12-31'],
  }[precision];
  return {
    start: parseIsoDate(bounds[0] as string),
    end: parseIsoDate(bounds[1] as string),
    precision,
    kind: expectedKindFor(source),
    source,
    bracketHours: null,
    ...over,
  };
}

describe('rendering by precision', () => {
  test('a day renders as an ISO day', () => {
    expect(formatResolvedDate(dateFrom(DateSource.EXIF_ARBITRATED)).text).toBe('1999-10-14');
  });
  test('a month renders as a French month and year', () => {
    expect(
      formatResolvedDate(dateFrom(DateSource.ALBUM_MONTH, DatePrecision.MONTH)).text,
    ).toBe('octobre 1999');
  });
  test('a year renders as the year alone', () => {
    expect(
      formatResolvedDate(dateFrom(DateSource.ALBUM_YEAR, DatePrecision.YEAR)).text,
    ).toBe('1999');
  });
  test('every month of the year has a French name', () => {
    const rendered = Array.from({ length: 12 }, (_unused, index) => {
      const month = String(index + 1).padStart(2, '0');
      return formatResolvedDate(
        dateFrom(DateSource.ALBUM_MONTH, DatePrecision.MONTH, {
          start: parseIsoDate(`2003-${month}-01`),
          end: parseIsoDate(`2003-${month}-28`),
        }),
      ).text;
    });
    expect(rendered).toEqual([
      'janvier 2003', 'février 2003', 'mars 2003', 'avril 2003',
      'mai 2003', 'juin 2003', 'juillet 2003', 'août 2003',
      'septembre 2003', 'octobre 2003', 'novembre 2003', 'décembre 2003',
    ]);
  });
});

describe('INVARIANT §7.1 — an inference must never look like a reading', () => {
  test('two different natures never produce the same rendering', () => {
    for (const precision of ALL_PRECISIONS) {
      const byKind = new Map<DateKind, string>();
      for (const source of ALL_SOURCES) {
        const out = formatResolvedDate(dateFrom(source, precision));
        const rendering = `${out.glyph}|${out.text}`;
        const seen = byKind.get(out.kind as DateKind);
        if (seen === undefined) {
          byKind.set(out.kind as DateKind, rendering);
        } else {
          expect(seen).toBe(rendering); // same nature ⇒ same rendering
        }
      }
      const renderings = [...byKind.values()];
      expect(new Set(renderings).size, `collision at precision ${precision}`).toBe(
        renderings.length,
      );
    }
  });

  test.each(ALL_SOURCES)('%s carries the glyph of its nature', (source) => {
    const out = formatResolvedDate(dateFrom(source));
    const glyphForKind = { reading: '', inference: '≈', decision: '✓' };
    expect(out.glyph).toBe(glyphForKind[expectedKindFor(source)]);
  });

  test('a reading never carries the approximation glyph', () => {
    for (const source of ALL_SOURCES) {
      const out = formatResolvedDate(dateFrom(source));
      if (out.kind === DateKind.READING) expect(out.glyph).toBe('');
    }
  });

  test('a date whose kind contradicts its source refuses to render', () => {
    const lying = dateFrom(DateSource.ALBUM_MONTH, DatePrecision.MONTH, {
      kind: DateKind.READING,
    });
    expect(() => formatResolvedDate(lying)).toThrow(KindDisagreementError);
  });
});

describe('INVARIANT §9.6.4 — a coarse precision never emits a finer unit', () => {
  test.each(ALL_SOURCES)('a month from %s emits no day number', (source) => {
    const out = formatResolvedDate(dateFrom(source, DatePrecision.MONTH));
    expect(out.text).toBe('octobre 1999');
    expect(out.text).not.toMatch(/\b(?:0?[1-9]|[12]\d|3[01])\b/);
  });

  test.each(ALL_SOURCES)('a year from %s emits neither month nor day', (source) => {
    const out = formatResolvedDate(dateFrom(source, DatePrecision.YEAR));
    expect(out.text).toBe('1999');
  });
});

describe('INVARIANT §7.4 — absent is not zero', () => {
  test('a null date renders "sans date"', () => {
    const out = formatResolvedDate(null);
    expect(out.text).toBe('sans date');
    expect(out.kind).toBe('absent');
    expect(out.glyph).toBe('');
    expect(out.detail).toBeNull();
  });
  test('a null date never renders an epoch or a placeholder day', () => {
    expect(formatResolvedDate(null).text).not.toMatch(/\d/);
  });
});

describe('INVARIANT §7.1 — the bracket travels with its proposal', () => {
  test('a bracket is rendered when present', () => {
    expect(
      formatResolvedDate(dateFrom(DateSource.LOGBOOK_BRACKET, DatePrecision.DAY, {
        bracketHours: 96,
      })).detail,
    ).toBe('± 96 h');
  });
  test('a logbook proposal without a bracket says so, never a number', () => {
    const out = formatResolvedDate(dateFrom(DateSource.LOGBOOK_BRACKET));
    expect(out.detail).toBe('sans fourchette');
    expect(out.detail).not.toMatch(/\d/);
  });
});

describe('the arbitration is observable', () => {
  const arbitration = (outcome: 'accepted' | 'rejected', gapMonths: number): DateArbitration => ({
    exifDate: '1999-08-14T10:22:00' as DateArbitration['exifDate'],
    gapMonths,
    outcome,
  });

  test('an accepted EXIF states the measured gap to the album', () => {
    expect(
      formatResolvedDate(dateFrom(DateSource.EXIF_ARBITRATED), arbitration('accepted', 2)).detail,
    ).toBe('EXIF, confirmé à 2 mois du mois d’album');
  });
  test('a rejected EXIF says it was set aside', () => {
    expect(
      formatResolvedDate(
        dateFrom(DateSource.ALBUM_MONTH, DatePrecision.MONTH),
        arbitration('rejected', 17),
      ).detail,
    ).toBe('EXIF écarté, à 17 mois du mois d’album');
  });
  test('a zero-month gap is rendered, not treated as absent', () => {
    expect(
      formatResolvedDate(dateFrom(DateSource.EXIF_ARBITRATED), arbitration('accepted', 0)).detail,
    ).toBe('EXIF, confirmé à 0 mois du mois d’album');
  });
});

describe('the nature is carried by words, not only by colour', () => {
  test.each([
    [DateSource.EXIF_ARBITRATED, 'date lue'],
    [DateSource.ALBUM_MONTH, 'date inférée'],
    [DateSource.ANNOTATION, 'date décidée à la main'],
  ])('%s is labelled "%s"', (source, expected) => {
    expect(formatResolvedDate(dateFrom(source)).label).toContain(expected);
  });
  test('the label repeats the rendered text so a screen reader hears both', () => {
    const out = formatResolvedDate(dateFrom(DateSource.ALBUM_MONTH, DatePrecision.MONTH));
    expect(out.label).toBe('date inférée : octobre 1999');
  });
  test('an absent date is labelled without a nature', () => {
    expect(formatResolvedDate(null).label).toBe('sans date');
  });
});

describe('a lying server fails loudly rather than rendering something plausible', () => {
  test('a month outside 1-12 refuses to render', () => {
    const impossible = {
      ...dateFrom(DateSource.ALBUM_MONTH, DatePrecision.MONTH),
      start: '1999-99-01' as ResolvedDate['start'],
    };
    expect(() => formatResolvedDate(impossible)).toThrow(/malformed month/);
  });

  test('a precision outside the closed vocabulary refuses to render', () => {
    const impossible = {
      ...dateFrom(DateSource.ALBUM_MONTH),
      precision: 'decade' as ResolvedDate['precision'],
    };
    expect(() => formatResolvedDate(impossible)).toThrow(/unmapped DatePrecision/);
  });
});

describe('INVARIANT — a wide range never displays as a narrow date', () => {
  // The CHECK fix means `precision` qualifies each BOUND, not the width. A
  // ref.album_span on `1998-02-Maison rose Algès` covers seventeen months at
  // month precision. Rendering `start` alone would show "février 1998" and make
  // seventeen months look like one -- the capital rule's fault applied to width
  // instead of nature, on the 421 photos the spec calls the best value in the
  // project.
  const span = (start: string, end: string, precision: DatePrecision, source: DateSource) => ({
    start: parseIsoDate(start), end: parseIsoDate(end), precision,
    kind: expectedKindFor(source), source, bracketHours: null,
  });

  test('a seventeen-month album span renders both ends', () => {
    expect(
      formatResolvedDate(
        span('1998-02-01', '1999-06-30', DatePrecision.MONTH, DateSource.ALBUM_MONTH),
      ).text,
    ).toBe('février 1998 – juin 1999');
  });

  test('a single month still renders as one month', () => {
    expect(
      formatResolvedDate(
        span('1999-10-01', '1999-10-31', DatePrecision.MONTH, DateSource.ALBUM_MONTH),
      ).text,
    ).toBe('octobre 1999');
  });

  test('two months in the same year both appear', () => {
    expect(
      formatResolvedDate(
        span('2000-12-01', '2001-02-28', DatePrecision.MONTH, DateSource.ALBUM_MONTH),
      ).text,
    ).toBe('décembre 2000 – février 2001');
  });

  test('a multi-year span renders both years', () => {
    expect(
      formatResolvedDate(
        span('2000-01-01', '2001-12-31', DatePrecision.YEAR, DateSource.ALBUM_YEAR),
      ).text,
    ).toBe('2000 – 2001');
  });

  test('a single year still renders as one year', () => {
    expect(
      formatResolvedDate(
        span('2000-01-01', '2000-12-31', DatePrecision.YEAR, DateSource.ALBUM_YEAR),
      ).text,
    ).toBe('2000');
  });

  test('a bracketed proposal spanning days renders both days', () => {
    expect(
      formatResolvedDate(
        span('1999-12-08', '1999-12-12', DatePrecision.DAY, DateSource.LOGBOOK_BRACKET),
      ).text,
    ).toBe('1999-12-08 – 1999-12-12');
  });

  test('a span is still marked with the glyph of its nature', () => {
    const out = formatResolvedDate(
      span('1998-02-01', '1999-06-30', DatePrecision.MONTH, DateSource.ALBUM_MONTH),
    );
    expect(out.glyph).toBe('≈');
    expect(out.kind).toBe(DateKind.INFERENCE);
  });

  test('the accessible label spells the range out rather than reading a dash', () => {
    expect(
      formatResolvedDate(
        span('1998-02-01', '1999-06-30', DatePrecision.MONTH, DateSource.ALBUM_MONTH),
      ).label,
    ).toBe('date inférée : de février 1998 à juin 1999');
  });

  test('a point date keeps its simple label', () => {
    expect(
      formatResolvedDate(
        span('1999-10-01', '1999-10-31', DatePrecision.MONTH, DateSource.ALBUM_MONTH),
      ).label,
    ).toBe('date inférée : octobre 1999');
  });
});
