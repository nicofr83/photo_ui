/**
 * The invariant fixture matrix.
 *
 * These are NOT a sample of the corpus. Every entry exists to cover one branch
 * of the rules in `docs/frontend-spec.md`, and `photos.test.ts` fails if a
 * branch stops being represented. The measured cases from the spec (§7.3's
 * December album, §3.2's Maison rose, §A.1's scan dates) appear verbatim.
 *
 * Typed rather than JSON on purpose: the compiler checks them against the
 * contract, so a fixture cannot drift from the schema without failing the build.
 */
import type { PhotoListItem } from '../../src/api/contract/photo';
import { parseIsoDate, parseLocalDateTime } from '../../src/shared/date_interface';
import { DateKind, DatePrecision, DateSource, MatchField, PositionSource } from '../../src/shared/enums';

/** A sha256 with no file behind it: the grey-tile path of §5.2. */
export const MISSING_THUMB_SHA256 =
  'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

const NO_PLACE = { city: null, state: null, country: null, countryRaw: null, sublocation: null };

interface Seed {
  id: string;
  sha: string;
  file: string;
  album: string | null;
  group?: string | null;
  date: PhotoListItem['date'];
  arbitration?: PhotoListItem['arbitration'];
  rawDateSource: string;
  captureLocal?: string | null;
  position?: PhotoListItem['position'];
  place?: PhotoListItem['place'];
  people?: string[];
  aesthetics?: number | null;
  inTasks?: string[];
  matchedOn?: PhotoListItem['matchedOn'];
  caption?: PhotoListItem['captionExcerpt'];
}

function photo(seed: Seed): PhotoListItem {
  return {
    cloudAssetId: seed.id,
    sha256: seed.sha,
    date: seed.date,
    arbitration: seed.arbitration ?? null,
    rawDateSource: seed.rawDateSource,
    captureDateLocal: seed.captureLocal === undefined || seed.captureLocal === null
      ? null
      : parseLocalDateTime(seed.captureLocal),
    captureOffsetMin: null,
    captureDateRaw: null,
    position: seed.position ?? null,
    place: seed.place ?? NO_PLACE,
    albumPath: seed.album,
    groupName: seed.group ?? null,
    fileName: seed.file,
    format: 'jpg',
    width: 2560,
    height: 1920,
    aestheticsScore: seed.aesthetics ?? 50,
    people: seed.people ?? [],
    inTaskSlugs: seed.inTasks ?? [],
    matchedOn: seed.matchedOn ?? [],
    hasCaption: seed.caption !== undefined,
    captionExcerpt: seed.caption ?? null,
    thumbUrl: `/images/${seed.sha}/thumb`,
    renderUrl: `/images/${seed.sha}/render?edge=1400`,
  };
}

// parseIsoDate rather than a cast: a malformed fixture date throws at module
// load instead of quietly becoming a value the schema would later reject.
const day = (d: string, source: DateSource, kind: DateKind, bracketHours: number | null = null) =>
  ({
    start: parseIsoDate(d), end: parseIsoDate(d),
    precision: DatePrecision.DAY, kind, source, bracketHours,
  });

const month = (start: string, end: string) => ({
  start: parseIsoDate(start), end: parseIsoDate(end), precision: DatePrecision.MONTH,
  kind: DateKind.INFERENCE, source: DateSource.ALBUM_MONTH, bracketHours: null,
});

export const INVARIANT_PHOTOS: readonly PhotoListItem[] = [
  // — Rank 2: EXIF kept by the arbitration. A READING. ————————————————
  photo({
    id: '05b9a4fac5df4dd28dcc1002d7ec0074',
    sha: '0000ece8560fb1570e87910e1f3c9630117a0a5cd80da6a09dff88b81bd29f90',
    file: 'PICT0042.jpg',
    album: '1998-1999/1999-10 Lisboa Madere', group: 'Lisboa Madere',
    date: day('1999-10-14', DateSource.EXIF_ARBITRATED, DateKind.READING),
    arbitration: { exifDate: parseLocalDateTime('1999-10-14T15:02:00'), gapMonths: 0, outcome: 'accepted' },
    rawDateSource: 'capture-date', captureLocal: '1999-10-14T15:02:00',
    people: ['Hugo'], aesthetics: 62,
    place: { ...NO_PLACE, country: 'Portugal', countryRaw: 'Portugal' },
  }),
  photo({
    id: '1a2b3c4d5e6f708192a3b4c5d6e7f801',
    sha: '000349b4fb96601f72bc758da381b64a0e054cf6d61ec53522bde781e4161b20',
    file: 'PICT0107.jpg',
    album: '2002/2002-04-Ghislaine est a Saint Martin', group: 'Saint Martin',
    date: day('2002-04-18', DateSource.EXIF_ARBITRATED, DateKind.READING),
    arbitration: { exifDate: parseLocalDateTime('2002-04-18T09:11:00'), gapMonths: 2, outcome: 'accepted' },
    rawDateSource: 'capture-date', captureLocal: '2002-04-18T09:11:00',
    people: ['Ghislaine'], aesthetics: 71,
    position: { lat: 18.07, lon: -63.05, kind: DateKind.READING, source: PositionSource.EXIF },
    place: { ...NO_PLACE, city: 'Marigot', country: 'Saint-Martin', countryRaw: 'Saint-Martin' },
  }),

  // — Rank 1: a human decision. The ONLY decision source. ————————————
  photo({
    id: 'e8bc80b75e254b7db2e1454222416813',
    sha: '0002bfe4d2a48c7175d99003cefe10600b748ea3b9e95e2340b2fb049a81755a',
    file: 'scan-0007.jpg',
    album: '1998-1999/1999-03 Lisboa Madere', group: 'Lisboa Madere',
    date: day('1999-03-02', DateSource.ANNOTATION, DateKind.DECISION),
    rawDateSource: 'folder-sequence', aesthetics: 41,
    inTasks: ['1999-transat'],
  }),

  // — Rank 3: a logbook proposal. WITH its bracket, and without. ——————
  photo({
    id: '2b3c4d5e6f708192a3b4c5d6e7f80911',
    sha: '0006244376803950e83073b40d104ca89044f80c6bb236e29301ef7049b5c7ca',
    file: 'PICT0233.jpg',
    album: '1998-1999/1999-12 Capvert Guadeloupe', group: 'Capvert Guadeloupe',
    date: day('1999-12-08', DateSource.LOGBOOK_BRACKET, DateKind.INFERENCE, 96),
    rawDateSource: 'none', aesthetics: 58,
    position: {
      lat: 14.73, lon: -40.2, kind: DateKind.INFERENCE,
      source: PositionSource.LOGBOOK_INTERPOLATED,
    },
  }),
  photo({
    id: '3c4d5e6f708192a3b4c5d6e7f8091122',
    sha: '0006b5d912b2527258990dffe30364f9e9bcd91cc70b40202424dcc31ddea51d',
    file: 'PICT0234.jpg',
    album: '1998-1999/1999-12 Capvert Guadeloupe', group: 'Capvert Guadeloupe',
    // No bracket: the UI must say "sans fourchette", never an unsupported number.
    date: day('1999-12-09', DateSource.LOGBOOK_BRACKET, DateKind.INFERENCE, null),
    rawDateSource: 'none', aesthetics: 44,
  }),

  // — §7.3, verbatim: the December 2000 album. 243 photos to the month. ——
  photo({
    id: '864808752b754c10aca1dffbc93a10a2',
    sha: '0002f8ec95afb8c045f4d59ab57a52e7183f7eb9f2e51dd99816646e315a6958',
    file: 'PICT0311.jpg',
    album: '2000-2001/2000-12-viree au Venezuela-3mois', group: 'viree au Venezuela',
    date: month('2000-12-01', '2000-12-31'),
    rawDateSource: 'folder-month', aesthetics: 55, people: ['Nicolas', 'Gigi'],
    position: { lat: 10.98, lon: -63.86, kind: DateKind.READING, source: PositionSource.EXIF },
    place: { ...NO_PLACE, city: 'Porlamar', country: 'Venezuela', countryRaw: 'Venezuela' },
    matchedOn: [{ field: MatchField.ALBUM_PATH, value: '2000-12-viree au Venezuela-3mois' }],
  }),

  // — §3.2, verbatim: the prefix names a start, not a month. ——————————
  photo({
    id: '4d5e6f708192a3b4c5d6e7f809112233',
    sha: '0006c12f53315d04ad88f900bcab25a147d407e0fe038737a5fbbfc9d95b1c2a',
    file: '98-99 maison rose Lisbonne (N).jpg',
    album: '1998-1999/1998-02-Maison rose Algès', group: 'Maison rose Algès',
    date: month('1998-02-01', '1998-02-28'),
    rawDateSource: 'folder-month-assumed', aesthetics: 33,
    place: { ...NO_PLACE, city: 'Lisbonne' },
    matchedOn: [{ field: MatchField.ALBUM_PATH, value: '1998-02-Maison rose Algès' }],
  }),

  // — Rank 4: EXIF REJECTED. The scan date of §A.1. Still an inference. ——
  photo({
    id: '5e6f708192a3b4c5d6e7f80911223344',
    sha: '0008b6a5a3e99af5a569c73271c6c8eb41cb73bd919368020706b2e3aebed668',
    file: '6ieme Lisbonne 98-99.jpg',
    album: '1998-1999/1998-02-Maison rose Algès', group: 'Maison rose Algès',
    date: month('1998-02-01', '1998-02-28'),
    // Scanned in 2013: 190 months from the album. The EXIF is a scanner clock.
    arbitration: { exifDate: parseLocalDateTime('2013-12-04T11:47:00'), gapMonths: 190, outcome: 'rejected' },
    rawDateSource: 'capture-date', captureLocal: '2013-12-04T11:47:00', aesthetics: 29,
  }),

  // — Rank 6: an album with a year only. The 30 never-sorted photos. ————
  photo({
    id: '6f708192a3b4c5d6e7f8091122334455',
    sha: '0009dd202f4c0c376c832316ec2241ce372e06c69b9840e5021d3320574abd42',
    file: 'img_0012.jpg',
    album: '2000-2001/2000', group: null,
    date: {
      start: parseIsoDate('2000-01-01'), end: parseIsoDate('2000-12-31'),
      precision: DatePrecision.YEAR,
      kind: DateKind.INFERENCE, source: DateSource.ALBUM_YEAR, bracketHours: null,
    },
    rawDateSource: 'folder-year', aesthetics: 20,
  }),

  // — No date at all. The "sans date" path of §5.2. ————————————————————
  photo({
    id: '708192a3b4c5d6e7f809112233445566',
    sha: MISSING_THUMB_SHA256,
    file: 'sans-vignette.jpg',
    album: '2002/2002-38Dec02', group: 'Dec02',
    date: null, rawDateSource: 'none', aesthetics: null,
  }),

  // — 2003-2004: the years no text can ever cover. ——————————————————————
  photo({
    id: '8192a3b4c5d6e7f80911223344556677',
    sha: '000a86651c4788e727de62d6fc893f21341f4c2173b1d6e6d80a1ca402e81333',
    file: 'DSCN2201.jpg',
    album: '2004/2004-03- visite de Tikal', group: 'visite de Tikal',
    date: day('2004-03-11', DateSource.EXIF_ARBITRATED, DateKind.READING),
    arbitration: { exifDate: parseLocalDateTime('2004-03-11T08:30:00'), gapMonths: 0, outcome: 'accepted' },
    rawDateSource: 'capture-date', captureLocal: '2004-03-11T08:30:00',
    aesthetics: 78, people: ['Hugo', 'Nicolas'],
    caption: { text: 'Des ruines mayas émergent de la forêt.', highlights: [{ start: 4, length: 6 }] },
    matchedOn: [{ field: MatchField.CAPTION, value: 'ruines mayas' }],
  }),
  photo({
    id: '92a3b4c5d6e7f8091122334455667788',
    sha: '000b44bd55d0c913520cbf1800c02af776853770d2f4ba85b0761209cdb99214',
    file: 'DSCN2202.jpg',
    album: '2003/2003-11-Sorel-Beaufort-Fort Lauderdale', group: 'Sorel-Beaufort-Fort Lauderdale',
    date: month('2003-11-01', '2003-11-30'),
    rawDateSource: 'folder-month', aesthetics: 51,
    matchedOn: [{ field: MatchField.ALBUM_PATH, value: '2003-11-Sorel-Beaufort-Fort Lauderdale' }],
  }),
] as const;
