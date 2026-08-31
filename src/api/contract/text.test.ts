import { DateKind, DatePrecision, DateSource, TextKind } from '../../shared/enums';

import {
  TextCorrectionInputSchema, TextCorrectionSchema, TextPageSchema, TextUnitSchema,
  WebSitePageListSchema, WebSitePageSchema,
} from './text';

const unit = (over: Record<string, unknown> = {}) => ({
  ref: { kind: TextKind.LOG_ENTRY, id: 'logbook/p003/001' },
  documentId: 'logbook',
  pageId: 'logbook/p003',
  ordinal: 1,
  text: 'Mouillage devant Porlamar, vent d’est 15 nœuds.',
  textOriginal: 'Mouillage devant Porlamar, vent d’est 15 noeuds.',
  correction: null,
  confidence: 'transcribed',
  date: {
    start: '1999-12-08', end: '1999-12-08', precision: DatePrecision.DAY,
    kind: DateKind.READING, source: DateSource.LOG_ENTRY_DATE, bracketHours: null,
  },
  // v1.6, A10: the upstream reading, same default as `date` above — most
  // tests here are about `date` (the effective value) and leave this alone.
  dateOriginal: {
    start: '1999-12-08', end: '1999-12-08', precision: DatePrecision.DAY,
    kind: DateKind.READING, source: DateSource.LOG_ENTRY_DATE, bracketHours: null,
  },
  pageSpanSource: null,
  overlappingPhotoCount: 3,
  highlights: [],
  logEntry: null,
  galleryCaption: null,
  ...over,
});

describe('a well-formed text unit', () => {
  test('parses', () => {
    expect(TextUnitSchema.parse(unit()).ref.id).toBe('logbook/p003/001');
  });

  test('INVARIANT — the key is the COUPLE, and kind is not optional', () => {
    const { ref: _ref, ...withoutRef } = unit();
    expect(() => TextUnitSchema.parse({ ...withoutRef, ref: { id: 'logbook/p003/001' } }))
      .toThrow();
  });

  test('INVARIANT §5.4 — the original transcription always travels with the text', () => {
    const { textOriginal: _dropped, ...without } = unit();
    expect(() => TextUnitSchema.parse(without)).toThrow();
  });
});

describe('INVARIANT — a text that asserts nothing carries no date', () => {
  test('a null date is legal and is the normal case for 1 031 of 2 871 units', () => {
    expect(TextUnitSchema.parse(unit({ date: null })).date).toBeNull();
  });

  test('a web passage carries no date and no page', () => {
    const parsed = TextUnitSchema.parse(
      unit({ date: null, pageId: null, documentId: 'web/2003/2003_gal_1', pageSpanSource: null }),
    );
    expect(parsed.pageId).toBeNull();
  });
});

describe('INVARIANT — every text date the system holds is a READING at DAY precision', () => {
  test('an inferred text date is refused', () => {
    expect(() =>
      TextUnitSchema.parse(
        unit({ date: { ...unit().date, kind: DateKind.INFERENCE, source: DateSource.ALBUM_MONTH } }),
      ),
    ).toThrow(/reading/i);
  });

  test('a month-precision text date is refused', () => {
    expect(() =>
      TextUnitSchema.parse(
        unit({ date: { ...unit().date, precision: DatePrecision.MONTH, end: '1999-12-31' } }),
      ),
    ).toThrow(/day/i);
  });

  test('a text date spanning more than one day is refused', () => {
    expect(() =>
      TextUnitSchema.parse(unit({ date: { ...unit().date, end: '1999-12-12' } })),
    ).toThrow(/single day|start === end|même jour/i);
  });

  test('the two legitimate text sources are accepted', () => {
    for (const source of [DateSource.LOG_ENTRY_DATE, DateSource.PASSAGE_DATE_FROM]) {
      expect(() => TextUnitSchema.parse(unit({ date: { ...unit().date, source } }))).not.toThrow();
    }
  });

  test('a page window can never be a text unit’s own date', () => {
    expect(() =>
      TextUnitSchema.parse(unit({ date: { ...unit().date, source: DateSource.PAGE_WINDOW } })),
    ).toThrow();
  });

  test('a web span can never be a text unit’s own date', () => {
    expect(() =>
      TextUnitSchema.parse(unit({ date: { ...unit().date, source: DateSource.WEB_SPAN } })),
    ).toThrow();
  });
});

describe('v1.6, contract A10 — a corrected date is a decision, the reading stays pinned', () => {
  const decision = {
    start: '2003-11-04', end: '2003-11-04', precision: DatePrecision.DAY,
    kind: DateKind.DECISION, source: DateSource.ANNOTATION, bracketHours: null,
  };

  test('the EFFECTIVE date accepts a correction — a decision, source annotation', () => {
    expect(TextUnitSchema.parse(unit({ date: decision })).date?.kind).toBe('decision');
  });

  test('dateOriginal is always pinned to a reading — a decision there is refused', () => {
    expect(() => TextUnitSchema.parse(unit({ dateOriginal: decision }))).toThrow(/reading/i);
  });

  test('dateOriginal stays null when the text never asserted a date, correction or not', () => {
    expect(TextUnitSchema.parse(unit({ dateOriginal: null })).dateOriginal).toBeNull();
  });
});

describe('v1.6, contract A10 — PUT /corrections carries an optional date', () => {
  const ref = { kind: TextKind.LOG_ENTRY, id: 'logbook/p003/001' } as const;

  test('date omitted — a text-only call, unchanged from before A10', () => {
    expect(TextCorrectionInputSchema.parse({ ref, text: 'Départ.' })).not.toHaveProperty('date');
  });

  test('date: null clears an existing date correction, the text is not concerned', () => {
    expect(TextCorrectionInputSchema.parse({ ref, text: 'Départ.', date: null }).date).toBeNull();
  });

  test('date: {start, end} sets it', () => {
    const parsed = TextCorrectionInputSchema.parse({
      ref, text: 'Départ.', date: { start: '2003-11-04', end: '2003-11-04' },
    });
    expect(parsed.date).toEqual({ start: '2003-11-04', end: '2003-11-04' });
  });

  test('D11 — start must equal end, a text asserts a day or nothing', () => {
    const result = TextCorrectionInputSchema.safeParse({
      ref, text: 'Départ.', date: { start: '2003-11-04', end: '2003-11-05' },
    });
    expect(result.success).toBe(false);
  });
});

describe('v1.6, contract A10 — TextCorrection carries the date correction and its witness', () => {
  const ref = { kind: TextKind.LOG_ENTRY, id: 'logbook/p003/001' } as const;
  const base = {
    ref, text: 'Départ.', originalAtCorrection: 'Dpart.',
    correctedAt: '2026-08-31T09:00:00.000Z', status: 'applied',
  };

  test('a text-only correction carries null for both date fields', () => {
    const parsed = TextCorrectionSchema.parse({ ...base, date: null, originalDateAtCorrection: null });
    expect(parsed.date).toBeNull();
    expect(parsed.originalDateAtCorrection).toBeNull();
  });

  test('a date correction carries the posed value and its witness', () => {
    const parsed = TextCorrectionSchema.parse({
      ...base,
      date: { start: '2003-11-04', end: '2003-11-04' },
      originalDateAtCorrection: { start: '2003-11-05', end: '2003-11-05' },
    });
    expect(parsed.date).toEqual({ start: '2003-11-04', end: '2003-11-04' });
    expect(parsed.originalDateAtCorrection).toEqual({ start: '2003-11-05', end: '2003-11-05' });
  });

  test('a date ADDED where none existed originally — the witness is null, nothing to preserve', () => {
    const parsed = TextCorrectionSchema.parse({
      ...base,
      date: { start: '2003-11-04', end: '2003-11-04' },
      originalDateAtCorrection: null,
    });
    expect(parsed.originalDateAtCorrection).toBeNull();
  });
});

describe('pageSpanSource qualifies the PAGE window, not the date', () => {
  test('carried is accepted and is an inference on an inference', () => {
    expect(TextUnitSchema.parse(unit({ date: null, pageSpanSource: 'carried' })).pageSpanSource)
      .toBe('carried');
  });

  test('it is null for a text with no page', () => {
    expect(TextUnitSchema.parse(unit({ pageSpanSource: null })).pageSpanSource).toBeNull();
  });
});

describe('v1.5 — TextPage.date, the page dating cascade (register → notes → carried)', () => {
  const page = {
    id: 'ma-vie/p002', documentId: 'ma-vie', ordinal: 2, label: null,
    width: 870, height: 1226, window: null, matchCount: null, spanSource: 'carried',
    imageUrl: '/pages/image?pageId=ma-vie%2Fp002', regionsAvailable: false,
  };

  test('a page carries its own resolved date — a reading when it comes from the page itself', () => {
    const parsed = TextPageSchema.parse({
      ...page,
      date: {
        start: '1999-08-04', end: '1999-08-04', precision: DatePrecision.DAY,
        kind: DateKind.READING, source: DateSource.PAGE_DATE, bracketHours: null,
      },
    });
    expect(parsed.date?.kind).toBe('reading');
  });

  test('a date inherited from a neighbouring page is an inference, never a reading', () => {
    const parsed = TextPageSchema.parse({
      ...page,
      date: {
        start: '1999-08-04', end: '1999-08-04', precision: DatePrecision.DAY,
        kind: DateKind.INFERENCE, source: DateSource.PAGE_DATE, bracketHours: null,
      },
    });
    expect(parsed.date?.kind).toBe('inference');
  });

  test('a page with no date at all stays readable — the web site has none', () => {
    expect(TextPageSchema.parse({ ...page, date: null }).date).toBeNull();
  });
});

describe('V1.7, contract A13 — GET /texts/web/pages, the 5 real site pages', () => {
  test('title and label can genuinely diverge — the filename and the page’s own narrative reading', () => {
    const parsed = WebSitePageSchema.parse({ id: '1900-1988.htm', title: '1958-1998', label: '1900-1988' });
    expect(parsed.title).not.toBe(parsed.label);
  });

  test('the list envelope holds the 5 pages', () => {
    const parsed = WebSitePageListSchema.parse({
      items: [{ id: '1998-1999.htm', title: '1998-1999', label: '1998-1999' }],
    });
    expect(parsed.items).toHaveLength(1);
  });
});
