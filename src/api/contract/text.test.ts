import { DateKind, DatePrecision, DateSource, TextKind } from '../../shared/enums';

import { TextPageSchema, TextUnitSchema } from './text';

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
