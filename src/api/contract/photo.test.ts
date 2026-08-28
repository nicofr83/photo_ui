import { DateKind, DatePrecision, DateSource } from '../../shared/enums';

import { ListEnvelopeSchema, PhotoListItemSchema } from './photo';

const valid = {
  cloudAssetId: '05b9a4fac5df4dd28dcc1002d7ec0074',
  sha256: '0000ece8560fb1570e87910e1f3c9630117a0a5cd80da6a09dff88b81bd29f90',
  date: {
    start: '1999-10-14', end: '1999-10-14', precision: DatePrecision.DAY,
    kind: DateKind.READING, source: DateSource.EXIF_ARBITRATED, bracketHours: null,
  },
  arbitration: { exifDate: '1999-10-14T15:02:00', gapMonths: 0, outcome: 'accepted' },
  rawDateSource: 'capture-date',
  captureDateLocal: '1999-10-14T15:02:00',
  captureOffsetMin: null,
  captureDateRaw: '1999:10:14 15:02:00',
  position: null,
  place: { city: null, state: null, country: null, countryRaw: null, sublocation: null },
  albumPath: '1998-1999/1999-10 Lisboa Madere',
  groupName: 'Lisboa Madere',
  fileName: 'PICT0042.jpg',
  format: 'jpg',
  width: 2560,
  height: 1920,
  aestheticsScore: 62,
  people: ['Hugo'],
  inTaskSlugs: [],
  matchedOn: [],
  hasCaption: false,
  captionExcerpt: null,
  thumbUrl: '/images/0000ece8560fb1570e87910e1f3c9630117a0a5cd80da6a09dff88b81bd29f90/thumb',
  renderUrl: '/images/0000ece8560fb1570e87910e1f3c9630117a0a5cd80da6a09dff88b81bd29f90/render?edge=1400',
};

describe('a well-formed photo', () => {
  test('parses', () => {
    expect(PhotoListItemSchema.parse(valid).cloudAssetId).toBe(valid.cloudAssetId);
  });
  test('INVARIANT §7.4 — may carry no resolved date at all', () => {
    expect(PhotoListItemSchema.parse({ ...valid, date: null, arbitration: null }).date)
      .toBeNull();
  });
  test('INVARIANT §7.4 — a null position is null, never a zero coordinate', () => {
    expect(PhotoListItemSchema.parse(valid).position).toBeNull();
  });
});

describe('INVARIANT §9.6.7 — photos.id never crosses the contract', () => {
  test('a numeric id is refused, not ignored', () => {
    expect(() => PhotoListItemSchema.parse({ ...valid, id: 25_000 })).toThrow();
  });
});

describe('INVARIANT §9.6.4 — no pre-formatted date ever crosses the contract', () => {
  test('a rendered French date is refused', () => {
    expect(() =>
      PhotoListItemSchema.parse({ ...valid, date: { ...valid.date, start: '14 octobre 1999' } }),
    ).toThrow();
  });
  test('a timestamp where a civil day belongs is refused', () => {
    expect(() =>
      PhotoListItemSchema.parse({
        ...valid, date: { ...valid.date, start: '1999-10-14T00:00:00Z' },
      }),
    ).toThrow();
  });
  test('both bounds are required, even when equal', () => {
    const { end: _dropped, ...withoutEnd } = valid.date;
    expect(() => PhotoListItemSchema.parse({ ...valid, date: withoutEnd })).toThrow();
  });
});

describe('INVARIANT §7.1 — a lying (source, kind) pair is refused at the boundary', () => {
  test('an album month declared a reading never reaches a component', () => {
    expect(() =>
      PhotoListItemSchema.parse({
        ...valid,
        date: { ...valid.date, source: DateSource.ALBUM_MONTH, kind: DateKind.READING },
      }),
    ).toThrow(/album_month/);
  });
  test('the honest pair passes', () => {
    expect(() =>
      PhotoListItemSchema.parse({
        ...valid,
        date: {
          ...valid.date, source: DateSource.ALBUM_MONTH, kind: DateKind.INFERENCE,
          precision: DatePrecision.MONTH, start: '1999-10-01', end: '1999-10-31',
        },
      }),
    ).not.toThrow();
  });
});

describe('closed vocabularies are closed', () => {
  test('a raw pipeline dateSource is refused as a contract source', () => {
    expect(() =>
      PhotoListItemSchema.parse({ ...valid, date: { ...valid.date, source: 'folder-sequence' } }),
    ).toThrow();
  });
  test('rawDateSource, which IS the pipeline vocabulary, stays an open string', () => {
    expect(PhotoListItemSchema.parse({ ...valid, rawDateSource: 'folder-month-assumed' })
      .rawDateSource).toBe('folder-month-assumed');
  });
});

describe('ListEnvelope', () => {
  const envelope = {
    items: [valid],
    total: 273,
    populationTotal: 3930,
    excludedCount: 3657,
    filters: { applied: [{ parameter: 'dateFrom', values: ['2000-12-01'], broadened: false }], unmatchedValues: [] },
    importId: 'import_01JB',
  };

  test('INVARIANT §9.6.8 — a total and a page are two things', () => {
    const parsed = ListEnvelopeSchema(PhotoListItemSchema).parse(envelope);
    expect(parsed.total).toBe(273);
    expect(parsed.items).toHaveLength(1);
  });

  test('INVARIANT §7.3 — the excluded count is required, never optional', () => {
    const { excludedCount: _dropped, ...without } = envelope;
    expect(() => ListEnvelopeSchema(PhotoListItemSchema).parse(without)).toThrow();
  });

  test('an unmatched open-vocabulary value travels with its nearest neighbours', () => {
    const parsed = ListEnvelopeSchema(PhotoListItemSchema).parse({
      ...envelope,
      filters: {
        applied: [],
        unmatchedValues: [{ parameter: 'tag', value: 'licorne', nearest: ['licence'] }],
      },
    });
    expect(parsed.filters.unmatchedValues[0]?.value).toBe('licorne');
  });
});
