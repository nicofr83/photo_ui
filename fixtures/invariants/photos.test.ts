import { PhotoListItemSchema } from '../../src/api/contract/photo';
import { DateKind, DatePrecision, DateSource, PositionSource } from '../../src/shared/enums';

import { INVARIANT_PHOTOS, MISSING_THUMB_SHA256 } from './photos';

/** The sources that can appear on a PHOTO. Text sources are covered in T2. */
const PHOTO_SOURCES = [
  DateSource.ANNOTATION,
  DateSource.EXIF_ARBITRATED,
  DateSource.LOGBOOK_BRACKET,
  DateSource.ALBUM_MONTH,
  DateSource.ALBUM_YEAR,
] as const;

describe('every fixture satisfies the frozen contract', () => {
  test.each(INVARIANT_PHOTOS.map((p) => [p.fileName, p] as const))(
    '%s parses',
    (_name, photo) => {
      const result = PhotoListItemSchema.safeParse(photo);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    },
  );

  test('cloudAssetIds are unique — they are the durable key', () => {
    const ids = INVARIANT_PHOTOS.map((p) => p.cloudAssetId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the fixtures are a branch matrix, not a sample', () => {
  test('every photo date source is represented', () => {
    const sources = new Set(INVARIANT_PHOTOS.flatMap((p) => (p.date ? [p.date.source] : [])));
    expect(sources).toEqual(new Set(PHOTO_SOURCES));
  });

  test('all three natures are represented', () => {
    const kinds = new Set(INVARIANT_PHOTOS.flatMap((p) => (p.date ? [p.date.kind] : [])));
    expect(kinds).toEqual(new Set(Object.values(DateKind)));
  });

  test('all three precisions are represented', () => {
    const p = new Set(INVARIANT_PHOTOS.flatMap((x) => (x.date ? [x.date.precision] : [])));
    expect(p).toEqual(new Set(Object.values(DatePrecision)));
  });

  test('INVARIANT §7.4 — a photo with no resolved date at all is present', () => {
    expect(INVARIANT_PHOTOS.some((p) => p.date === null)).toBe(true);
  });

  test('the three arbitration outcomes are present: accepted, rejected, and none', () => {
    const outcomes = new Set(INVARIANT_PHOTOS.map((p) => p.arbitration?.outcome ?? 'none'));
    expect(outcomes).toEqual(new Set(['accepted', 'rejected', 'none']));
  });

  test('a proposal WITH a bracket and one WITHOUT are both present', () => {
    const proposals = INVARIANT_PHOTOS.filter(
      (p) => p.date?.source === DateSource.LOGBOOK_BRACKET,
    );
    expect(proposals.some((p) => p.date?.bracketHours !== null)).toBe(true);
    expect(proposals.some((p) => p.date?.bracketHours === null)).toBe(true);
  });

  test('both position natures and a null position are present', () => {
    const sources = new Set(INVARIANT_PHOTOS.map((p) => p.position?.source ?? 'none'));
    expect(sources).toEqual(
      new Set([PositionSource.EXIF, PositionSource.LOGBOOK_INTERPOLATED, 'none']),
    );
  });

  test('a photo already held by another task is present — information, not prohibition', () => {
    expect(INVARIANT_PHOTOS.some((p) => p.inTaskSlugs.length > 0)).toBe(true);
  });

  test('a photo answered by its album name rather than by GPS is present', () => {
    expect(
      INVARIANT_PHOTOS.some((p) => p.matchedOn.some((m) => m.field === 'album_path')),
    ).toBe(true);
  });

  test('a place with a city but no country is present, and the reverse', () => {
    expect(
      INVARIANT_PHOTOS.some((p) => p.place.city !== null && p.place.country === null),
    ).toBe(true);
    expect(
      INVARIANT_PHOTOS.some((p) => p.place.city === null && p.place.country !== null),
    ).toBe(true);
  });

  test('a photo whose thumbnail file is missing on disk is present', () => {
    expect(INVARIANT_PHOTOS.some((p) => p.sha256 === MISSING_THUMB_SHA256)).toBe(true);
  });
});

describe('the measured cases from the spec are present verbatim', () => {
  test('§7.3 — the December 2000 album, dated to the month', () => {
    const december = INVARIANT_PHOTOS.find((p) =>
      p.albumPath?.includes('viree au Venezuela'),
    );
    expect(december?.date).toMatchObject({
      start: '2000-12-01',
      end: '2000-12-31',
      precision: DatePrecision.MONTH,
      kind: DateKind.INFERENCE,
    });
  });

  test('§3.2 — the Maison rose album, whose prefix names a start and not a month', () => {
    expect(INVARIANT_PHOTOS.some((p) => p.albumPath?.includes('Maison rose'))).toBe(true);
  });

  test('§A.1 — a scan date rejected by the arbitration is present', () => {
    const scanned = INVARIANT_PHOTOS.find((p) => p.arbitration?.outcome === 'rejected');
    expect(scanned?.arbitration?.gapMonths).toBeGreaterThan(60);
    expect(scanned?.date?.kind).toBe(DateKind.INFERENCE);
  });
});

describe('INVARIANT contract §1 — every string crossing the API is NFC', () => {
  test.each(INVARIANT_PHOTOS.map((p) => [p.fileName, p] as const))(
    '%s carries no decomposed string',
    (_name, photo) => {
      for (const value of [photo.albumPath, photo.groupName, photo.fileName]) {
        if (value !== null) expect(value).toBe(value.normalize('NFC'));
      }
    },
  );
});
