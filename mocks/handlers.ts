/**
 * MSW handlers implementing the frozen contract.
 *
 * These deliberately import the SAME `overlaps` and the same schemas the
 * application uses. A mock with its own semantics would make every component
 * test validate a fiction.
 */
import { http, HttpResponse } from 'msw';

import { firstDayOfMonth, lastDayOfMonth } from '../src/domain/monthRange';
import { centreDistanceDays, overlaps, widthDays, type DayInterval } from '../src/domain/interval';
import type { OverlapInfo, OverlapSummary, PhotoWithOverlap } from '../src/api/contract/overlap';
import type { FacetBucket, PhotoFacets, PhotoListItem } from '../src/api/contract/photo';
import {
  AlbumSpanDeleteInputSchema, AlbumSpanPutInputSchema, WebSpanDeleteInputSchema,
  WebSpanPutInputSchema, type AlbumSpanUpdateResult, type AlbumSpanWarning, type WebDocumentRow,
} from '../src/api/contract/ref';
import type { TextRef, TextUnit } from '../src/api/contract/text';
import { isIsoDate, parseIsoDate, type IsoDate } from '../src/shared/date_interface';
import {
  CorrectionStatus, DateKind, DatePrecision, DateSource, ErrorCode, MatchField, OverlapRule,
  PhotoSort, TaskState,
} from '../src/shared/enums';
import {
  TaskImagesMutationSchema, TaskNoteCreateInputSchema, TaskPatchInputSchema, TaskTextsMutationSchema,
  type TaskDetail,
} from '../src/api/contract/task';
import type { Album } from '../src/api/contract/album';
import type { Job } from '../src/api/contract/job';

import { store } from './store';
import { PHOTO_OCR, PHOTO_TAGS } from '../fixtures/invariants/photoTags';
import { INVARIANT_PAGES, INVARIANT_TEXT_FACETS, INVARIANT_WEB_PROPOSALS } from '../fixtures/invariants/texts';

/**
 * The mock's own knowledge of which tags name a place — standing in for
 * `ref.tag_kind`, never for the frontend to hold. Measured cases from
 * ETAT-TRAVAUX.md: `italy` hits 18 real Tikal photos, `egypt` 30 of Morocco.
 * Excluded from the vocabulary `PhotoFacets.tags` offers; still matchable by
 * `tag=`, since spec §7.1/§7.3 says searchable, never hidden from results.
 */
const PLACE_TAG_NAMES: ReadonlySet<string> = new Set(['italy', 'egypt']);

/** Contract §4.2. Anything outside this list is an UNKNOWN_PARAMETER. */
const PHOTO_PARAMS = [
  'scope', 'dateFrom', 'dateTo', 'reliableDatesOnly', 'albumPath', 'tag',
  'tagMinConfidence', 'person', 'country', 'city', 'hasPosition', 'hasOcr',
  'hasCaption', 'q', 'overlapsTextKind', 'overlapsTextId', 'inTask', 'notInTask',
  'sort', 'limit', 'offset',
] as const;

function error(status: number, code: string, message: string, details: unknown): Response {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}

/**
 * The window a text covers, and which rule produced it — contract §2.7.
 * A text with neither a date of its own nor a page falls back to its
 * document's `ref.web_span`; with none of the three it covers nothing, and
 * that is a normal, common state (§5.3), not an error.
 */
function effectiveTextWindow(text: TextUnit): { window: DayInterval; rule: OverlapRule } | null {
  if (text.date !== null) {
    const rule = text.ref.kind === 'log_entry' ? OverlapRule.LOGBOOK_ENTRY : OverlapRule.PASSAGE;
    return { window: { start: text.date.start, end: text.date.end }, rule };
  }
  if (text.pageId !== null) {
    const page = INVARIANT_PAGES.find((p) => p.id === text.pageId);
    return page?.window == null
      ? null
      : { window: { start: page.window.start, end: page.window.end }, rule: OverlapRule.PASSAGE };
  }
  const doc = store.documents.find((d) => d.id === text.documentId);
  return doc?.span == null
    ? null
    : { window: { start: doc.span.start, end: doc.span.end }, rule: OverlapRule.WEB_SPAN };
}

function overlapInfo(photo: DayInterval, text: DayInterval, rule: OverlapRule): OverlapInfo {
  return {
    rule,
    photoSpanDays: widthDays(photo),
    textSpanDays: widthDays(text),
    totalSpanDays: widthDays(photo) + widthDays(text),
    distanceToCentreDays: centreDistanceDays(photo, text),
  };
}

/**
 * A gallery caption's "overlap" is a DIRECT image match, never a date
 * window (contract §11 Q11) — every span reported as zero rather than
 * computed, so a caller cannot mistake it for a measured proximity.
 */
const GALLERY_MATCH_OVERLAP: OverlapInfo = {
  rule: OverlapRule.GALLERY_MATCH,
  photoSpanDays: 0, textSpanDays: 0, totalSpanDays: 0, distanceToCentreDays: 0,
};

function galleryMatchedPhoto(text: TextUnit): PhotoListItem | null {
  if (text.galleryCaption === null) return null;
  return store.photos.find((p) => p.sha256 === text.galleryCaption?.sha256) ?? null;
}

/** Spec §4.3: says what the matched set is worth, and where it is weak. */
function summarise(dates: ReadonlyArray<{ precision: string } | null>, windowDays: number): OverlapSummary {
  return {
    matchCount: dates.length,
    windowDays,
    datedToDayCount: dates.filter((d) => d?.precision === DatePrecision.DAY).length,
    datedToMonthCount: dates.filter((d) => d?.precision === DatePrecision.MONTH).length,
    datedToYearCount: dates.filter((d) => d?.precision === DatePrecision.YEAR).length,
    undatedCount: dates.filter((d) => d === null).length,
  };
}

interface UnmatchedValue {
  parameter: string;
  value: string;
  nearest: string[];
}

/**
 * What `DELETE /ref/album-span` reverts TO — the prefix-derived interval,
 * never the entered one with a flag flipped. Whole month when the prefix
 * names one, whole year otherwise; unchanged (still presumed) if the album
 * has no prefix year at all, since there is nothing to derive it from.
 */
function presumedSpanFor(album: Album): Album['span'] {
  if (album.prefixYear === null) return { ...album.span, presumed: true, note: null };
  if (album.prefixMonth === null) {
    return {
      from: `${String(album.prefixYear)}-01-01`, to: `${String(album.prefixYear)}-12-31`,
      presumed: true, note: null,
    } as Album['span'];
  }
  const month = `${String(album.prefixYear)}-${String(album.prefixMonth).padStart(2, '0')}`;
  return {
    from: firstDayOfMonth(month), to: lastDayOfMonth(month), presumed: true, note: null,
  } as Album['span'];
}

/** Contract §4.8: the ONE recompute rule that refuses. */
function albumSpanWarnings(album: Album, dateFrom: string, dateTo: string): AlbumSpanWarning[] {
  const warnings: AlbumSpanWarning[] = [];
  if (album.prefixYear !== null) {
    const yearStart = `${String(album.prefixYear)}-01-01`;
    const yearEnd = `${String(album.prefixYear)}-12-31`;
    if (!(dateFrom <= yearEnd && yearStart <= dateTo)) {
      warnings.push({ code: 'outside_prefix_year', prefixYear: album.prefixYear });
    }
  }
  const overlapping = store.albums.find(
    (a) => a.path !== album.path && a.span.from <= dateTo && dateFrom <= a.span.to,
  );
  if (overlapping !== undefined) {
    warnings.push({ code: 'overlaps_album', albumPath: overlapping.path });
  }
  return warnings;
}

function isoDayMinusOne(day: IsoDate): IsoDate {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return parseIsoDate(d.toISOString().slice(0, 10));
}

/**
 * v1.5: a web document's span carries only an ENTERED start — the end is
 * derived, never entered. Chaining is between DATED web documents, by
 * date, never by `document_id`: the next one's date minus a day, or this
 * document's own date if it is the last. An undated document is never
 * rescued by inheritance — recomputed for every affected document whenever
 * any one span changes, since adding/removing one shifts its neighbours'
 * ends.
 */
function recomputeWebSpanEnds(): void {
  const dated = store.documents
    .filter((d) => d.kind === 'html' && d.span !== null)
    .sort((a, b) => (a.span?.start ?? '').localeCompare(b.span?.start ?? ''));
  dated.forEach((doc, i) => {
    if (doc.span === null) return;
    const next = dated[i + 1];
    const end = next?.span == null ? doc.span.start : isoDayMinusOne(next.span.start);
    doc.span = { ...doc.span, end };
  });
}

const PERIMETER_YEARS = ['1998', '1999', '2000', '2001', '2002', '2003', '2004'];

/**
 * v1.5, Task 12 (contract §4.8): a path OR a proposal falling in the
 * 1998-2004 period, with at least two passages. Never a hardcoded list of
 * document ids — that would go stale on the next reimport.
 */
function inWebPerimeter(row: WebDocumentRow): boolean {
  if (row.passageCount < 2) return false;
  const pathYear = PERIMETER_YEARS.some((year) => row.pathHint.includes(year));
  const proposalYear = row.proposal !== null && PERIMETER_YEARS.includes(row.proposal.date.slice(0, 4));
  return pathYear || proposalYear;
}

function textIncludes(haystack: string | null, needle: string): boolean {
  return haystack !== null && haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * `TaskImageSelection.outOfPeriod`, task 26 (`server`): computed LIVE against
 * the task's CURRENT period, never baked in at selection time — a period
 * edited after the fact must never leave a stale flag behind, same reasoning
 * as why the eight review counters are computed server-side rather than
 * carried. Absent period or absent photo date: nothing to be out of.
 */
function imageOutOfPeriod(photo: PhotoListItem | undefined, period: TaskDetail['period']): boolean {
  if (photo === undefined || photo.date === null || period === null) return false;
  return !overlaps(photo.date, { start: period.from, end: period.to });
}

/**
 * Contract §7.3's timeline: layout, derived client-normally, but the mock
 * plays the server's part of naming each entry's OWN bounds and nature —
 * never flattened to a point, never guessed for a text that asserts none.
 * A gallery caption (no date, no page, no document span) contributes none.
 */
function timelineEntryFor(
  text: TextUnit,
): { start: IsoDate; end: IsoDate; precision: string; kind: string } | null {
  if (text.date !== null) {
    return {
      start: text.date.start, end: text.date.end,
      precision: text.date.precision, kind: text.date.kind,
    };
  }
  if (text.pageId !== null) {
    const page = INVARIANT_PAGES.find((p) => p.id === text.pageId);
    return page?.window == null ? null : {
      start: page.window.start, end: page.window.end,
      precision: page.window.precision, kind: page.window.kind,
    };
  }
  const doc = store.documents.find((d) => d.id === text.documentId);
  return doc?.span == null ? null : {
    start: doc.span.start, end: doc.span.end,
    precision: doc.span.precision, kind: doc.span.kind,
  };
}

/**
 * Spec §5.3: a generous reading of place — a photo with no EXIF place still
 * answers `country`/`city` if its album or group name names it, and the
 * result says WHICH field actually answered, never pretending it was the
 * place field. `matchField`/`groupOrAlbum` are the two ends of that fallback.
 */
function placeMatch(
  photo: PhotoListItem,
  placeField: string | null,
  matchField: 'country' | 'city',
  needle: string,
): { field: MatchField; value: string } | null {
  if (textIncludes(placeField, needle)) {
    return {
      field: matchField === 'country' ? MatchField.PLACE_COUNTRY : MatchField.PLACE_CITY,
      value: placeField ?? needle,
    };
  }
  if (textIncludes(photo.albumPath, needle)) {
    return { field: MatchField.ALBUM_PATH, value: photo.albumPath ?? needle };
  }
  if (textIncludes(photo.groupName, needle)) {
    return { field: MatchField.GROUP_NAME, value: photo.groupName ?? needle };
  }
  return null;
}

/**
 * Contract §4.2's content axes, shared between `/photos` and
 * `/photos/facets` so the two never drift into two different definitions of
 * "matches". Returns the kept photos WITH `matchedOn` recomputed for the
 * place axes — the rest of `matchedOn` (tag, caption, file name…) is
 * whatever the fixture already carries, since a full plein-texte match
 * report is not the point of this mock.
 */
function applyContentFilters(
  population: readonly PhotoListItem[],
  params: URLSearchParams,
): PhotoListItem[] {
  let kept: PhotoListItem[] = [...population];

  if (params.get('reliableDatesOnly') === 'true') {
    kept = kept.filter((p) => p.date?.precision === DatePrecision.DAY);
  }

  const tags = params.getAll('tag');
  if (tags.length > 0) {
    kept = kept.filter((p) =>
      tags.some((t) => (PHOTO_TAGS[p.cloudAssetId] ?? []).some((pt) => pt.name === t)));
  }

  const people = params.getAll('person');
  if (people.length > 0) {
    kept = kept.filter((p) => people.some((person) => p.people.includes(person)));
  }

  const countries = params.getAll('country');
  if (countries.length > 0) {
    kept = kept
      .filter((p) => countries.some((c) => placeMatch(p, p.place.country, 'country', c) !== null))
      .map((p) => {
        const match = countries.map((c) => placeMatch(p, p.place.country, 'country', c))
          .find((m) => m !== null);
        return match === undefined ? p : { ...p, matchedOn: [...p.matchedOn, match] };
      });
  }

  const cities = params.getAll('city');
  if (cities.length > 0) {
    kept = kept
      .filter((p) => cities.some((c) => placeMatch(p, p.place.city, 'city', c) !== null))
      .map((p) => {
        const match = cities.map((c) => placeMatch(p, p.place.city, 'city', c)).find((m) => m !== null);
        return match === undefined ? p : { ...p, matchedOn: [...p.matchedOn, match] };
      });
  }

  if (params.get('hasPosition') === 'true') kept = kept.filter((p) => p.position !== null);
  if (params.get('hasOcr') === 'true') {
    kept = kept.filter((p) => (PHOTO_OCR[p.cloudAssetId] ?? null) !== null);
  }
  if (params.get('hasCaption') === 'true') kept = kept.filter((p) => p.hasCaption);

  const q = params.get('q');
  if (q !== null) {
    // An empty needle returns zero results, never the whole corpus — same
    // rule as /texts?q=.
    const needle = q.trim().toLowerCase();
    kept = needle === '' ? [] : kept.filter((p) => {
      const photoTags = PHOTO_TAGS[p.cloudAssetId] ?? [];
      return textIncludes(p.fileName, needle)
        || textIncludes(p.albumPath, needle)
        || textIncludes(p.groupName, needle)
        || p.people.some((person) => textIncludes(person, needle))
        || textIncludes(p.place.country, needle)
        || textIncludes(p.place.city, needle)
        || photoTags.some((t) => textIncludes(t.name, needle))
        || textIncludes(p.captionExcerpt?.text ?? null, needle);
    });
  }

  return kept;
}

/** Contract §5.4: FacetBucket[], sorted by selectivity — fewest photos first. */
function bucketize(
  values: ReadonlyArray<string | null>,
  tooBroadNames: ReadonlySet<string> = new Set(),
): FacetBucket[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({
      value, count, ...(tooBroadNames.has(value) ? { tooBroad: true } : {}),
    }))
    .sort((a, b) => a.count - b.count || a.value.localeCompare(b.value, 'fr'));
}

const NOW = '2026-08-29T10:00:00.000Z' as TaskDetail['createdAt'];
/** v1.5, Task 13: the server's write allowlist for a task's export directory. */
const TASKS_ROOT = '/var/photo_ui/tasks';

export const handlers = [
  // Contract §4.1/§9: consulted at startup, polled during long operations.
  // Only `originals`/`tasks` vary in this mock — thumbs/pages/render_cache
  // are always available, since nothing here simulates them failing.
  http.get('*/system/status', () => {
    const now = NOW;
    return HttpResponse.json({
      importId: store.importId,
      importedAt: now,
      runningJobId: null,
      roots: [
        { name: 'originals', envVar: 'ORIGINALS_ROOT', path: '/Volumes/OWC Envoy Ultra', available: store.originalsAvailable, checkedAt: now },
        { name: 'thumbs', envVar: 'THUMBS_ROOT', path: '/var/photo_ui/thumbs', available: true, checkedAt: now },
        { name: 'pages', envVar: 'PAGES_ROOT', path: '/var/photo_ui/pages', available: true, checkedAt: now },
        { name: 'tasks', envVar: 'TASKS_ROOT', path: TASKS_ROOT, available: store.tasksRootAvailable, checkedAt: now },
        { name: 'render_cache', envVar: 'RENDER_CACHE_ROOT', path: '/var/photo_ui/render_cache', available: true, checkedAt: now },
      ],
      counts: {
        photosInHierarchy: store.photos.length, photosOutOfHierarchy: 0,
        albums: store.albums.length, documents: store.documents.length,
        passages: store.texts.filter((t) => t.ref.kind === 'passage').length,
        logEntries: store.texts.filter((t) => t.ref.kind === 'log_entry').length,
      },
      prerender: { total: store.photos.length, done: store.photos.length, running: false },
      captions: {
        total: store.photos.length,
        done: store.photos.filter((p) => p.hasCaption).length,
        edited: 0, running: false,
      },
      attention: {
        orphanedSelections: 0, correctionsNeedingReview: 0, correctionsOrphaned: 0,
        albumsWithPresumedSpan: store.albums.filter((a) => a.span.presumed).length,
        webDocumentsWithoutSpan: store.documents.filter((d) => d.kind === 'html' && d.span === null).length,
      },
      features: { datingExport: false },
    });
  }),

  // Contract §4.2: the 82 albums fit in one response.
  http.get('*/albums', () => HttpResponse.json({ items: store.albums })),

  http.get('*/documents', () => HttpResponse.json({ items: store.documents })),

  // Contract §4.8, écran « Réglages » — the referentials only a person can
  // fill. PUT/DELETE declared before nothing here needs shadow-avoidance:
  // neither /photos nor /texts owns a "ref" prefix.
  http.put('*/ref/album-span', async ({ request }) => {
    const body = AlbumSpanPutInputSchema.parse(await request.json());
    if (body.dateTo < body.dateFrom) {
      return error(400, ErrorCode.INVALID_PARAMETER, 'La date de fin précède la date de début.', {
        parameter: 'dateTo', received: body.dateTo, accepted: null,
      });
    }
    const album = store.albums.find((a) => a.path === body.albumPath);
    if (album === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Album introuvable.', {
        resource: 'album', id: body.albumPath,
      });
    }

    const warnings = albumSpanWarnings(album, body.dateFrom, body.dateTo);
    album.span = { from: body.dateFrom, to: body.dateTo, presumed: false, note: body.note };

    const result: AlbumSpanUpdateResult = {
      album,
      recomputed: {
        photosAffected: album.photoCount, datesChanged: album.photoCount, precisionChanged: 0,
      },
      warnings,
    };
    return HttpResponse.json(result);
  }),

  http.delete('*/ref/album-span', async ({ request }) => {
    const body = AlbumSpanDeleteInputSchema.parse(await request.json());
    const album = store.albums.find((a) => a.path === body.albumPath);
    if (album === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Album introuvable.', {
        resource: 'album', id: body.albumPath,
      });
    }

    album.span = presumedSpanFor(album);
    const result: AlbumSpanUpdateResult = {
      album,
      recomputed: {
        photosAffected: album.photoCount, datesChanged: album.photoCount, precisionChanged: 0,
      },
      warnings: [],
    };
    return HttpResponse.json(result);
  }),

  // v1.5, Task 12. `scope=perimeter` (default): a path OR a proposal falling
  // in 1998-2004, with at least two passages — the threshold that excludes
  // rebuts (a Google-verification file, empty templates) without naming any
  // file by id, which would go stale on the next reimport (contract §4.8).
  http.get('*/ref/web-documents', ({ request }) => {
    const scope = new URL(request.url).searchParams.get('scope') ?? 'perimeter';
    const items: WebDocumentRow[] = store.documents
      .filter((d) => d.kind === 'html')
      .map((d) => {
        const firstPassage = store.texts.find((t) => t.documentId === d.id);
        const proposal = INVARIANT_WEB_PROPOSALS[d.id] ?? null;
        return {
          documentId: d.id,
          title: d.title,
          passageCount: d.passageCount,
          excerpt: firstPassage === undefined ? d.title : firstPassage.text.slice(0, 120),
          span: d.span,
          pathHint: d.id,
          proposal,
        };
      })
      .filter((row) => scope === 'all' || inWebPerimeter(row));
    return HttpResponse.json({ items });
  }),

  http.put('*/ref/web-span', async ({ request }) => {
    const body = WebSpanPutInputSchema.parse(await request.json());
    const doc = store.documents.find((d) => d.id === body.documentId);
    if (doc === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Document introuvable.', {
        resource: 'document', id: body.documentId,
      });
    }
    // Contract §4.8: a web_span is always an INFERENCE — it fills a void,
    // never arbitrates. The capital rule (ResolvedDateSchema) would refuse
    // this response if it were marked `decision` instead. `end` is a
    // placeholder until recomputeWebSpanEnds derives the real one below.
    doc.span = {
      start: body.dateFrom, end: body.dateFrom, precision: DatePrecision.DAY,
      kind: DateKind.INFERENCE, source: DateSource.WEB_SPAN, bracketHours: null,
    };
    recomputeWebSpanEnds();
    return HttpResponse.json(doc);
  }),

  http.delete('*/ref/web-span', async ({ request }) => {
    const body = WebSpanDeleteInputSchema.parse(await request.json());
    const doc = store.documents.find((d) => d.id === body.documentId);
    if (doc === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Document introuvable.', {
        resource: 'document', id: body.documentId,
      });
    }
    doc.span = null;
    recomputeWebSpanEnds();
    return HttpResponse.json(doc);
  }),

  http.get('*/pages', ({ request }) => {
    const documentId = new URL(request.url).searchParams.get('documentId');
    return HttpResponse.json({
      items: INVARIANT_PAGES.filter((p) => documentId === null || p.documentId === documentId),
    });
  }),

  // Contract §4.2: "quels textes couvrent cette photo ?" — the other
  // direction of the SAME predicate used by `/photos?overlapsTextKind…`.
  // Declared BEFORE the generic `*/texts` handler below: MSW's leading `*`
  // matches any prefix, so `*/texts` alone would also swallow this nested
  // URL and win by registration order if it came first.
  http.get('*/photos/:cloudAssetId/texts', ({ params }) => {
    const photo = store.photos.find((p) => p.cloudAssetId === String(params['cloudAssetId']));
    if (photo === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Photo introuvable.', {
        resource: 'photo', id: String(params['cloudAssetId']),
      });
    }

    // Gallery captions match by sha256, never by date — computed BEFORE the
    // date-window branch below, and independent of whether the photo even
    // has a date at all.
    const galleryMatches = store.texts
      .filter((text) => text.galleryCaption?.sha256 === photo.sha256)
      .map((text) => ({ ...text, overlap: GALLERY_MATCH_OVERLAP }));

    const dateMatches = photo.date === null ? [] : store.texts
      .map((text) => {
        if (text.ref.kind === 'web_caption') return null; // handled above
        const effective = effectiveTextWindow(text);
        if (effective === null || photo.date === null) return null;
        if (!overlaps(photo.date, effective.window)) return null;
        return { ...text, overlap: overlapInfo(photo.date, effective.window, effective.rule) };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);

    const items = [...galleryMatches, ...dateMatches]
      .sort((a, b) => a.overlap.totalSpanDays - b.overlap.totalSpanDays);

    return HttpResponse.json({
      items,
      total: items.length,
      populationTotal: store.texts.length,
      excludedCount: store.texts.length - items.length,
      filters: { applied: [], unmatchedValues: [] },
      importId: store.importId,
      overlapSummary: summarise(
        items.map((t) => (t.date === null ? null : { precision: t.date.precision })),
        photo.date === null ? 0 : widthDays({ start: photo.date.start, end: photo.date.end }),
      ),
    });
  }),

  // v1.5, Task 10. Registered BEFORE the generic `*/texts` handler below:
  // MSW's leading `*` matches any prefix, so `*/texts` alone would also
  // swallow this nested URL and win by registration order if it came first.
  http.get('*/texts/facets', ({ request }) => {
    const documentId = new URL(request.url).searchParams.get('documentId');
    const facets = documentId === null ? undefined : INVARIANT_TEXT_FACETS[documentId];
    if (facets === undefined) {
      return HttpResponse.json({ years: [], months: [], days: [] });
    }
    return HttpResponse.json(facets);
  }),

  http.get('*/texts', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const documentId = params.get('documentId');
    const pageId = params.get('pageId');
    const kind = params.get('kind');
    const query = params.get('q');

    let kept = [...store.texts];
    if (documentId !== null) kept = kept.filter((t) => t.documentId === documentId);
    if (pageId !== null) kept = kept.filter((t) => t.pageId === pageId);
    if (kind !== null) kept = kept.filter((t) => t.ref.kind === kind);
    if (query !== null) {
      const needle = query.toLowerCase();
      // An empty needle returns zero results, never the whole corpus.
      kept = needle.trim() === ''
        ? []
        : kept.filter((t) => t.text.toLowerCase().includes(needle));
    }

    return HttpResponse.json({
      items: kept,
      total: kept.length,
      populationTotal: store.texts.length,
      excludedCount: store.texts.length - kept.length,
      filters: {
        applied: [...params.keys()].map((parameter) => ({
          parameter, values: params.getAll(parameter), broadened: false,
        })),
        unmatchedValues: [],
      },
      importId: store.importId,
    });
  }),

  // Contract §4.4: the ref travels in the BODY, never the path — it contains
  // `/` and is ambiguous without its kind (§2.6).
  http.put('*/corrections', async ({ request }) => {
    const body = (await request.json()) as { ref: { kind: string; id: string }; text: string };

    if (body.text.trim() === '') {
      return error(422, ErrorCode.EMPTY_CORRECTION, 'La correction ne peut pas être vide.', {
        ref: body.ref,
      });
    }

    const unit = store.texts.find((t) => t.ref.kind === body.ref.kind && t.ref.id === body.ref.id);
    if (unit === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Texte introuvable.', {
        resource: 'text', id: body.ref.id,
      });
    }

    unit.correction = {
      ref: unit.ref,
      text: body.text,
      originalAtCorrection: unit.textOriginal,
      correctedAt: NOW,
      status: CorrectionStatus.APPLIED,
    };
    unit.text = body.text;
    return HttpResponse.json(unit);
  }),

  http.post('*/corrections/revert', async ({ request }) => {
    const body = (await request.json()) as { ref: { kind: string; id: string } };
    const unit = store.texts.find((t) => t.ref.kind === body.ref.kind && t.ref.id === body.ref.id);
    if (unit === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Texte introuvable.', {
        resource: 'text', id: body.ref.id,
      });
    }

    // Idempotent: reverting a text with no correction just confirms the
    // current (already original) state rather than erroring.
    unit.correction = null;
    unit.text = unit.textOriginal;
    return HttpResponse.json(unit);
  }),

  // Real shape (server/src/metier/jobs/job_service.ts): the POST always
  // answers 202 with a job — `exportTask()` runs INSIDE the async runner, so
  // "directory exists" is never a synchronous error here either, only a
  // failed job the client learns about by polling (GET /jobs/:jobId below).
  // This mock resolves synchronously to a terminal state in the same
  // response — faithful to what the real export is in practice (a 1-2 image
  // task finishes before the client's first poll), while still exercising
  // the real terminal shapes `useJob`/ReviewScreen consume.
  http.post('*/tasks/:slug/export', async ({ params, request }) => {
    const slug = String(params['slug']);
    const task = store.tasks.get(slug);
    if (task === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Tâche introuvable.', { resource: 'task', id: slug });
    }
    const body = (await request.json()) as { overwrite: boolean };

    const base = {
      id: `job_${slug}_${String(store.jobs.size)}`,
      type: 'export' as const,
      createdAt: NOW, startedAt: NOW, finishedAt: NOW,
      progress: { done: task.images.length, total: task.images.length, label: null },
      cancellable: false,
    };

    // Never overwrite in silence: name the directory and let the user choose.
    if (store.exportDirectoryExists && !body.overwrite) {
      const job: Job = {
        ...base, state: 'failed', result: null,
        error: { code: ErrorCode.TARGET_DIRECTORY_EXISTS, message: `dossier déjà existant : /tasks/${slug}` },
      };
      store.jobs.set(job.id, job);
      return HttpResponse.json(job, { status: 202 });
    }

    // One image will not render. The export continues without it, and the
    // report names it with its cause.
    const unrenderable = task.images.filter((i) =>
      store.photos.some((p) => p.cloudAssetId === i.cloudAssetId && p.fileName === 'sans-vignette.jpg'),
    );

    const job: Job = {
      ...base, state: 'succeeded', error: null,
      result: {
        type: 'export',
        report: {
          directory: `/tasks/${slug}`,
          manifestPath: `/tasks/${slug}/manifest.json`,
          imagesWritten: task.images.length - unrenderable.length,
          pagesWritten: 0, textsWritten: 0, notesWritten: 0, bytesWritten: 0,
          skippedImages: unrenderable.map((i) => ({
            cloudAssetId: i.cloudAssetId, reason: 'SOURCE_FILE_MISSING', expectedPath: null,
          })),
          partial: false,
          exportedAt: NOW,
        },
      },
    };
    store.jobs.set(job.id, job);
    return HttpResponse.json(job, { status: 202 });
  }),

  http.get('*/jobs/:jobId', ({ params }) => {
    const job = store.jobs.get(String(params['jobId']));
    if (job === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Opération introuvable.', {
        resource: 'job', id: String(params['jobId']),
      });
    }
    return HttpResponse.json(job);
  }),

  // Contract §4.2: "quels textes couvrent cette photo ?" — the other
  // direction of the SAME predicate used by `/photos?overlapsTextKind…`.
  // Declared BEFORE `/photos/:cloudAssetId`: MSW/path-to-regexp tries
  // handlers in array order, and the plain `:cloudAssetId` pattern matches
  // greedily enough to shadow this one if it comes first.

  // Contract §5.4: a SEPARATE call from /photos — depends on neither sort
  // nor offset (contract §11 Q1, tranché). Same content axes, computed by
  // the SAME applyContentFilters, never a second definition of "matches".
  // ALSO declared before `/photos/:cloudAssetId`, same reason: `facets`
  // would otherwise be read as a (nonexistent) cloudAssetId.
  http.get('*/photos/facets', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const population = store.photos;

    let kept = population;
    const albumPaths = params.getAll('albumPath');
    if (albumPaths.length > 0) {
      const wanted = albumPaths.map((a) => a.normalize('NFC'));
      kept = kept.filter((p) => p.albumPath !== null && wanted.includes(p.albumPath.normalize('NFC')));
    }
    const dateFrom = params.get('dateFrom');
    const dateTo = params.get('dateTo');
    if (dateFrom !== null && isIsoDate(dateFrom) && dateTo !== null && isIsoDate(dateTo)) {
      kept = kept.filter((p) => p.date !== null && overlaps(p.date, { start: dateFrom, end: dateTo }));
    }
    kept = applyContentFilters(kept, params);

    const allTagNames = kept.flatMap((p) => (PHOTO_TAGS[p.cloudAssetId] ?? []).map((t) => t.name));
    const tooBroad = new Set(
      [...new Set(allTagNames)].filter((name) => allTagNames.filter((n) => n === name).length > 500),
    );

    const facets: PhotoFacets = {
      albums: bucketize(kept.map((p) => p.albumPath)),
      // The place-lying tags never enter the offered vocabulary — the ONE
      // client-visible effect of PLACE_TAG_NAMES, which never governs
      // filtering or search results, only what is proposed.
      tags: bucketize(allTagNames.filter((n) => !PLACE_TAG_NAMES.has(n)), tooBroad),
      people: bucketize(kept.flatMap((p) => p.people)),
      countries: bucketize(kept.map((p) => p.place.country)),
      cities: bucketize(kept.map((p) => p.place.city)),
      years: bucketize(kept.map((p) => (p.date === null ? null : p.date.start.slice(0, 4)))),
      positionedCount: kept.filter((p) => p.position !== null).length,
      withOcrCount: kept.filter((p) => (PHOTO_OCR[p.cloudAssetId] ?? null) !== null).length,
      datedToDayCount: kept.filter((p) => p.date?.precision === DatePrecision.DAY).length,
    };
    return HttpResponse.json(facets);
  }),

  http.get('*/photos/:cloudAssetId', ({ params }) => {
    const photo = store.photos.find((p) => p.cloudAssetId === String(params['cloudAssetId']));
    if (photo === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Photo introuvable.', {
        resource: 'photo', id: String(params['cloudAssetId']),
      });
    }
    return HttpResponse.json(detailFor(photo));
  }),

  http.get('*/tasks', () =>
    HttpResponse.json({
      items: [...store.tasks.values()]
        .map(({ images: _images, texts: _texts, brief: _brief, notes: _notes, ...summary }) => summary)
        // The most recently opened first. Spec §5.1.
        .sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? '')),
    }),
  ),

  // Contract §7.3, "tranché avec `impl-frontend`": the chronology is layout
  // and is derived client-side, but the EIGHT counters are NOT — computed
  // here so the frontend never risks a second implementation of the
  // recouvrement predicate that could disagree with GET /photos?overlapsText…
  // Declared BEFORE the plain /tasks/:slug below, same shadow-avoidance
  // reason as every other nested route in this file.
  http.get('*/tasks/:slug/review', ({ params }) => {
    const task = store.tasks.get(String(params['slug']));
    if (task === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Tâche introuvable.', {
        resource: 'task', id: String(params['slug']),
      });
    }

    const images = task.images
      .map((selection) => {
        const photo = store.photos.find((p) => p.cloudAssetId === selection.cloudAssetId);
        if (photo === undefined) return null;
        return { ...photo, selection: { ...selection, outOfPeriod: imageOutOfPeriod(photo, task.period) } };
      })
      .filter((i): i is NonNullable<typeof i> => i !== null);

    const texts = task.texts
      .map((selection) => {
        const unit = store.texts.find(
          (t) => t.ref.kind === selection.ref.kind && t.ref.id === selection.ref.id,
        );
        return unit === undefined ? null : { ...unit, selection };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);

    const hasCoveringText = (photoDate: PhotoListItem['date']): boolean => {
      if (photoDate === null) return false;
      return store.texts.some((t) => {
        const entry = timelineEntryFor(t);
        return entry !== null && overlaps(photoDate, { start: entry.start, end: entry.end });
      });
    };

    const warnings = {
      undatedImages: images.filter((i) => i.date === null).length,
      inferredDateImages: images.filter((i) => i.date?.kind === DateKind.INFERENCE).length,
      uncertainTexts: texts.filter((t) => t.confidence === 'uncertain').length,
      textsWiderThan30Days: texts.filter((t) => {
        const entry = timelineEntryFor(t);
        return entry !== null && widthDays({ start: entry.start, end: entry.end }) > 30;
      }).length,
      imagesWithoutText: images.filter((i) => !hasCoveringText(i.date)).length,
      orphanedImages: task.images.filter(
        (i) => !store.photos.some((p) => p.cloudAssetId === i.cloudAssetId),
      ).length,
      orphanedTexts: task.texts.filter(
        (t) => !store.texts.some((u) => u.ref.kind === t.ref.kind && u.ref.id === t.ref.id),
      ).length,
      imagesOutOfPeriod: (() => {
        const period = task.period;
        return period === null ? 0 : images.filter(
          (i) => i.date !== null && !overlaps(i.date, { start: period.from, end: period.to }),
        ).length;
      })(),
    };

    const timeline = [
      ...images
        .filter((i) => i.date !== null)
        .map((i) => ({
          kind: 'image' as const, id: i.cloudAssetId,
          start: i.date?.start ?? '', end: i.date?.end ?? '',
          precision: i.date?.precision ?? DatePrecision.DAY, dateKind: i.date?.kind ?? DateKind.READING,
        })),
      ...texts
        .map((t) => {
          const entry = timelineEntryFor(t);
          return entry === null ? null : {
            kind: 'text' as const, id: `${t.ref.kind}:${t.ref.id}`,
            start: entry.start, end: entry.end, precision: entry.precision, dateKind: entry.kind,
          };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null),
    ].sort((a, b) => a.start.localeCompare(b.start));

    const { images: _images, texts: _texts, brief: _brief, notes: taskNotes, ...summary } = task;

    return HttpResponse.json({
      task: summary, images, texts, notes: taskNotes, warnings, timeline,
    });
  }),

  http.get('*/tasks/:slug', ({ params }) => {
    const task = store.tasks.get(String(params['slug']));
    if (task === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Tâche introuvable.', {
        resource: 'task', id: String(params['slug']),
      });
    }
    return HttpResponse.json({
      ...task,
      images: task.images.map((selection) => ({
        ...selection,
        outOfPeriod: imageOutOfPeriod(
          store.photos.find((p) => p.cloudAssetId === selection.cloudAssetId),
          task.period,
        ),
      })),
    });
  }),

  // Contract §5.1: title/brief/period, any subset — never the slug, which
  // is editable at creation only (renaming it later would orphan a folder
  // already on disk).
  http.patch('*/tasks/:slug', async ({ params, request }) => {
    const slug = String(params['slug']);
    const task = store.tasks.get(slug);
    if (task === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Tâche introuvable.', { resource: 'task', id: slug });
    }
    const parsed = TaskPatchInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.join('.') ?? '<root>';
      return error(400, ErrorCode.INVALID_PARAMETER, `${path} : ${issue?.message ?? 'forme invalide'}`, {
        parameter: path, received: null, accepted: null,
      });
    }
    const patch = parsed.data;
    if (patch.period != null && patch.period.from > patch.period.to) {
      return error(400, ErrorCode.INVALID_PARAMETER, 'la période doit avoir from <= to', {
        parameter: 'period', received: JSON.stringify(patch.period), accepted: null,
      });
    }
    // v1.5, Task 13 (backend A8): confined under TASKS_ROOT, the server's
    // write allowlist — refused, never silently sanitised.
    if (patch.exportDirectory != null && !patch.exportDirectory.startsWith(`${TASKS_ROOT}/`)) {
      return error(422, ErrorCode.DIRECTORY_OUTSIDE_ROOT,
        'le répertoire de livraison doit rester sous TASKS_ROOT',
        { directory: patch.exportDirectory, root: TASKS_ROOT });
    }
    if (patch.title !== undefined) task.title = patch.title;
    if (patch.brief !== undefined) task.brief = patch.brief;
    if (patch.period !== undefined) task.period = patch.period;
    if (patch.exportDirectory !== undefined) {
      task.exportDirectory = patch.exportDirectory ?? `${TASKS_ROOT}/${slug}`;
    }
    task.updatedAt = NOW;

    const { images: _images, texts: _texts, brief: _brief, notes: _notes, ...summary } = task;
    return HttpResponse.json(summary);
  }),

  http.post('*/tasks', async ({ request }) => {
    const body = (await request.json()) as {
      slug: string; title: string; brief: string; period: unknown;
    };

    // Never let a task be created that could not be exported. Spec §5.1.
    if (!store.tasksRootAvailable) {
      return error(503, ErrorCode.VOLUME_UNAVAILABLE, 'Le dossier des tâches est inaccessible.', {
        root: '/tasks', envVar: 'TASKS_ROOT',
      });
    }

    const existing = store.tasks.get(body.slug);
    if (existing !== undefined) {
      return error(409, ErrorCode.SLUG_TAKEN, `Le slug « ${body.slug} » est déjà pris.`, {
        slug: body.slug, existingTaskTitle: existing.title,
      });
    }

    const created: TaskDetail = {
      slug: body.slug,
      title: body.title,
      brief: body.brief,
      period: null,
      imageCount: 0, textCount: 0, noteCount: 0, orphanCount: 0,
      state: TaskState.DRAFT,
      createdAt: NOW, updatedAt: NOW, lastOpenedAt: NOW,
      exportedAt: null, exportDirectory: null,
      contentHash: `hash-${body.slug}`, exportedContentHash: null,
      images: [],
      texts: [], notes: [],
    };
    store.tasks.set(body.slug, created);
    return HttpResponse.json(created, { status: 201 });
  }),

  // Contract §4.5: a shallow copy — fresh slug and title, everything else
  // starts empty, same as creating a task from scratch.
  http.post('*/tasks/:slug/duplicate', async ({ params, request }) => {
    const source = store.tasks.get(String(params['slug']));
    if (source === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Tâche introuvable.', {
        resource: 'task', id: String(params['slug']),
      });
    }
    const body = (await request.json()) as { title: string; slug: string };
    const existing = store.tasks.get(body.slug);
    if (existing !== undefined) {
      return error(409, ErrorCode.SLUG_TAKEN, `Le slug « ${body.slug} » est déjà pris.`, {
        slug: body.slug, existingTaskTitle: existing.title,
      });
    }

    const duplicate: TaskDetail = {
      slug: body.slug, title: body.title, brief: source.brief, period: source.period,
      imageCount: 0, textCount: 0, noteCount: 0, orphanCount: 0,
      state: TaskState.DRAFT,
      createdAt: NOW, updatedAt: NOW, lastOpenedAt: NOW,
      exportedAt: null, exportDirectory: null,
      contentHash: `hash-${body.slug}`, exportedContentHash: null,
      images: [], texts: [], notes: [],
    };
    store.tasks.set(body.slug, duplicate);
    return HttpResponse.json(duplicate, { status: 201 });
  }),

  // Contract §4.5: NEVER touches an already-exported directory — the
  // response names it so the confirmation can say so.
  http.delete('*/tasks/:slug', ({ params }) => {
    const slug = String(params['slug']);
    const task = store.tasks.get(slug);
    if (task === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Tâche introuvable.', { resource: 'task', id: slug });
    }
    store.tasks.delete(slug);
    return HttpResponse.json({
      deleted: true,
      exportDirectoryKept: task.exportDirectory,
    });
  }),

  http.post('*/tasks/:slug/images', async ({ params, request }) => {
    const task = store.tasks.get(String(params['slug']));
    if (task === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Tâche introuvable.', {
        resource: 'task', id: String(params['slug']),
      });
    }
    // Real shape, not the client's hope: `add[]` is objects, never bare ids
    // — a mismatch here is exactly the class of bug a lenient mock let
    // reach Nicolas in production (add: string[] instead of add:
    // {cloudAssetId, selectedBecause}[]). Refusing it the same way the real
    // server does is what makes THIS mock trustworthy again.
    const parsed = TaskImagesMutationSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.join('.') ?? '<root>';
      return error(400, ErrorCode.INVALID_PARAMETER, `${path} : ${issue?.message ?? 'forme invalide'}`, {
        parameter: path, received: null, accepted: null,
      });
    }
    const body = parsed.data;

    const held = new Set(task.images.map((i) => i.cloudAssetId));
    const added: string[] = [];
    const merged: string[] = [];
    const rejected: { cloudAssetId: string; reason: string }[] = [];

    for (const item of body.add ?? []) {
      if (!store.photos.some((p) => p.cloudAssetId === item.cloudAssetId)) {
        rejected.push({ cloudAssetId: item.cloudAssetId, reason: 'unknown_photo' });
        continue;
      }
      // Set union: re-adding is an idempotent success, never a rejection.
      if (held.has(item.cloudAssetId)) { merged.push(item.cloudAssetId); continue; }
      held.add(item.cloudAssetId);
      added.push(item.cloudAssetId);
      task.images.push({
        cloudAssetId: item.cloudAssetId, order: task.images.length, note: item.note ?? null,
        selectedBecause: item.selectedBecause,
        selectedAt: NOW, orphaned: false,
        // Placeholder: both GET handlers recompute this live against the
        // task's CURRENT period (imageOutOfPeriod) — never read from here.
        outOfPeriod: false,
      });
    }

    const removing = new Set(body.remove ?? []);
    const removed = task.images.filter((i) => removing.has(i.cloudAssetId)).map((i) => i.cloudAssetId);
    task.images = task.images.filter((i) => !removing.has(i.cloudAssetId));
    task.imageCount = task.images.length;

    // Manifest reorder, spec §5.6/Q6: a batch of swaps in ONE request, never
    // one request per row — the caller (useSelection.moveUp/moveDown) already
    // sends both halves of a swap together.
    for (const patch of body.update ?? []) {
      const image = task.images.find((i) => i.cloudAssetId === patch.cloudAssetId);
      if (image === undefined) continue;
      if (patch.order !== undefined) image.order = patch.order;
      if (patch.note !== undefined) image.note = patch.note;
    }

    return HttpResponse.json({
      // Real shape (server/src/contract/task_interface.ts): counts, never
      // the id arrays this mock used to hand back — nothing here reads
      // them back as arrays, only the wire shape needed correcting.
      added: added.length, merged: merged.length, removed: removed.length, updated: 0,
      // This mock's `update` loop only ever touches an id already held
      // (`continue`s past an unknown one) — the real "an update can
      // implicitly retain a not-yet-selected photo" behaviour is not
      // simulated here, so this stays empty rather than half-faking it.
      implicitlyAdded: [],
      rejected, warnings: [], imageCount: task.images.length,
      contentHash: `hash-${String(params['slug'])}-${String(task.images.length)}`,
      state: task.state,
    });
  }),

  // Contract §4.5: the text equivalent of /tasks/:slug/images. Q2 default
  // (a) — the whole passage, never an excerpt.
  http.post('*/tasks/:slug/texts', async ({ params, request }) => {
    const task = store.tasks.get(String(params['slug']));
    if (task === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Tâche introuvable.', {
        resource: 'task', id: String(params['slug']),
      });
    }
    // Validated, not cast: `ref.kind` is a closed vocabulary, and a loose
    // cast here would let the mock accept what the real server would refuse.
    const body = TaskTextsMutationSchema.parse(await request.json());

    const held = new Set(task.texts.map((t) => `${t.ref.kind}:${t.ref.id}`));
    const added: TextRef[] = [];
    const rejected: { ref: TextRef; reason: string }[] = [];

    for (const ref of body.add ?? []) {
      const known = store.texts.some((t) => t.ref.kind === ref.kind && t.ref.id === ref.id);
      if (!known) { rejected.push({ ref, reason: 'unknown_text' }); continue; }
      const k = `${ref.kind}:${ref.id}`;
      if (held.has(k)) continue; // idempotent: already selected, not an error.
      held.add(k);
      added.push(ref);
      task.texts.push({
        ref, order: task.texts.length, selectedAt: NOW, orphaned: false,
        startOffset: null, endOffset: null,
      });
    }

    const removing = new Set((body.remove ?? []).map((r) => `${r.kind}:${r.id}`));
    const removed = task.texts
      .filter((t) => removing.has(`${t.ref.kind}:${t.ref.id}`))
      .map((t) => t.ref);
    task.texts = task.texts.filter((t) => !removing.has(`${t.ref.kind}:${t.ref.id}`));

    for (const patch of body.reorder ?? []) {
      const entry = task.texts.find(
        (t) => t.ref.kind === patch.ref.kind && t.ref.id === patch.ref.id,
      );
      if (entry !== undefined) entry.order = patch.order;
    }

    task.textCount = task.texts.length;

    return HttpResponse.json({
      // Counts, not the ref arrays this mock used to return — same drift,
      // same fix as /tasks/:slug/images above.
      added: added.length, removed: removed.length,
      rejected, textCount: task.texts.length,
      contentHash: `hash-${String(params['slug'])}-${String(task.texts.length)}`,
    });
  }),

  // Spec §5.5: free notes, per task. `attachedTo` empty on both sides is the
  // common "note générale" case, never refused.
  http.post('*/tasks/:slug/notes', async ({ params, request }) => {
    const task = store.tasks.get(String(params['slug']));
    if (task === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Tâche introuvable.', {
        resource: 'task', id: String(params['slug']),
      });
    }
    // Validated, not just cast: `attachedTo.texts[].kind` is a closed
    // vocabulary, and a loose cast here would let the mock accept what the
    // real server would refuse.
    const body = TaskNoteCreateInputSchema.parse(await request.json());

    const note = {
      id: `note_${Math.random().toString(36).slice(2, 10)}`,
      title: body.title,
      text: body.text,
      createdAt: NOW,
      updatedAt: NOW,
      attachedTo: body.attachedTo,
      derivedFrom: body.derivedFrom ?? null,
      // A freshly created note's body IS exactly what was copied (or empty,
      // written from scratch) — never edited yet. The PATCH handler below
      // does not yet flip this on a later text edit (task 11's concern, not
      // task 1's): a known simplification, not a lie about THIS note's
      // current state.
      editedSince: false,
    };
    task.notes.push(note);
    task.noteCount = task.notes.length;
    return HttpResponse.json(note, { status: 201 });
  }),

  http.patch('*/tasks/:slug/notes/:noteId', async ({ params, request }) => {
    const task = store.tasks.get(String(params['slug']));
    const note = task?.notes.find((n) => n.id === String(params['noteId']));
    if (task === undefined || note === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Note introuvable.', {
        resource: 'note', id: String(params['noteId']),
      });
    }
    const body = (await request.json()) as { title?: string; text?: string };
    if (body.title !== undefined) note.title = body.title;
    if (body.text !== undefined) note.text = body.text;
    note.updatedAt = NOW;
    return HttpResponse.json(note);
  }),

  http.delete('*/tasks/:slug/notes/:noteId', ({ params }) => {
    const task = store.tasks.get(String(params['slug']));
    if (task === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Tâche introuvable.', {
        resource: 'task', id: String(params['slug']),
      });
    }
    task.notes = task.notes.filter((n) => n.id !== String(params['noteId']));
    task.noteCount = task.notes.length;
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('*/photos', ({ request }) => {
    const url = new URL(request.url);
    const params = url.searchParams;

    // A parameter NAME outside the allowlist is a client bug, and a filter that
    // silently disappears returns the whole library. Spec §9.6.1.
    const unknown = [...params.keys()].filter(
      (key) => !(PHOTO_PARAMS as readonly string[]).includes(key),
    );
    if (unknown.length > 0) {
      return error(400, ErrorCode.UNKNOWN_PARAMETER, `Paramètre inconnu : ${unknown.join(', ')}`, {
        parameters: unknown,
        accepted: [...PHOTO_PARAMS],
      });
    }

    // A VALUE outside a CLOSED vocabulary is known at compile time: a bug.
    const sort = params.get('sort') ?? PhotoSort.DATE_ASC;
    if (!(Object.values(PhotoSort) as string[]).includes(sort)) {
      return error(400, ErrorCode.INVALID_PARAMETER, `Valeur de tri inconnue : ${sort}`, {
        parameter: 'sort',
        received: sort,
        accepted: Object.values(PhotoSort),
      });
    }

    const rawFrom = params.get('dateFrom');
    const rawTo = params.get('dateTo');
    for (const [name, raw] of [['dateFrom', rawFrom], ['dateTo', rawTo]] as const) {
      if (raw !== null && !isIsoDate(raw)) {
        return error(400, ErrorCode.INVALID_PARAMETER, `Date invalide : ${raw}`, {
          parameter: name, received: raw, accepted: null,
        });
      }
    }
    // isIsoDate is a type guard, so these are branded IsoDate from here on.
    const dateFrom = rawFrom !== null && isIsoDate(rawFrom) ? rawFrom : null;
    const dateTo = rawTo !== null && isIsoDate(rawTo) ? rawTo : null;

    const albumPaths = params.getAll('albumPath');
    const population = store.photos;

    let kept = population;

    if (albumPaths.length > 0) {
      // NFC on both sides: the contract normalises at the boundary, so a literal
      // comparison is safe here.
      const wanted = albumPaths.map((a) => a.normalize('NFC'));
      kept = kept.filter((p) => p.albumPath !== null && wanted.includes(p.albumPath.normalize('NFC')));
    }

    if (dateFrom !== null && dateTo !== null) {
      // Overlap, never containment. Spec §7.3.
      kept = kept.filter(
        (p) => p.date !== null && overlaps(p.date, { start: dateFrom, end: dateTo }),
      );
    }

    // T3's content axes — tag, person, country, city, hasPosition, hasOcr,
    // hasCaption, q, reliableDatesOnly. Shared with /photos/facets so the
    // two never compute "matches" differently.
    kept = applyContentFilters(kept, params);

    // Contract §4.2: "quelles photos ce texte couvre-t-il ?" — the two
    // parameters travel together or not at all, same rule as the client side.
    const overlapsTextKind = params.get('overlapsTextKind');
    const overlapsTextId = params.get('overlapsTextId');
    let overlapSummary: OverlapSummary | null = null;
    let withOverlap: PhotoWithOverlap[] | null = null;

    if (overlapsTextKind !== null && overlapsTextId !== null) {
      const text = store.texts.find(
        (t) => t.ref.kind === overlapsTextKind && t.ref.id === overlapsTextId,
      );
      if (text === undefined) {
        return error(404, ErrorCode.NOT_FOUND, 'Texte introuvable.', {
          resource: 'text', id: overlapsTextId,
        });
      }

      if (text.ref.kind === 'web_caption') {
        // Direct match, never a window: the one photo this caption names,
        // if it is still in the current filter.
        const photo = galleryMatchedPhoto(text);
        const matched = photo === null ? [] : kept.filter((p) => p.cloudAssetId === photo.cloudAssetId);
        withOverlap = matched.map((p) => ({ ...p, overlap: GALLERY_MATCH_OVERLAP }));
        overlapSummary = summarise(
          matched.map((p) => (p.date === null ? null : { precision: p.date.precision })),
          0,
        );
      } else {
        const effective = effectiveTextWindow(text);
        const dated = kept.filter(
          (p): p is PhotoListItem & { date: NonNullable<PhotoListItem['date']> } => p.date !== null,
        );
        const matched = effective === null
          ? []
          : dated.filter((p) => overlaps(p.date, effective.window));

        withOverlap = effective === null ? [] : matched.map((p) => ({
          ...p, overlap: overlapInfo(p.date, effective.window, effective.rule),
        }));
        overlapSummary = summarise(
          matched.map((p) => ({ precision: p.date.precision })),
          effective === null ? 0 : widthDays(effective.window),
        );
      }
      kept = withOverlap;
    }

    if (withOverlap !== null && sort === PhotoSort.OVERLAP) {
      withOverlap = [...withOverlap].sort((a, b) => a.overlap.totalSpanDays - b.overlap.totalSpanDays);
      kept = withOverlap;
    } else if (withOverlap === null) {
      kept = sortPhotos(kept, sort);
    }

    // An OPEN vocabulary value that matches nothing is 200 with zero results —
    // it may exist after the next import. Contract §5.1.
    const unmatchedValues: UnmatchedValue[] = albumPaths
      .filter((a) => !population.some((p) => p.albumPath?.normalize('NFC') === a.normalize('NFC')))
      .map((value) => ({ parameter: 'albumPath', value, nearest: [] }));

    const applied = [...params.keys()]
      .filter((key) => !['limit', 'offset', 'sort'].includes(key))
      .map((parameter) => ({
        parameter,
        values: params.getAll(parameter),
        broadened: parameter === 'country' || parameter === 'city',
      }));

    const total = kept.length;
    const offset = Number(params.get('offset') ?? '0');
    const limitRaw = params.get('limit');
    const items = limitRaw === null ? kept.slice(offset) : kept.slice(offset, offset + Number(limitRaw));

    return HttpResponse.json({
      items,
      total,
      populationTotal: population.length,
      excludedCount: population.length - total,
      filters: { applied, unmatchedValues },
      importId: store.importId,
      ...(overlapSummary === null ? {} : { overlapSummary }),
    });
  }),
];

/** Undated photos group at the END of a date sort. Spec §5.2. */
function sortPhotos(photos: readonly PhotoListItem[], sort: string): PhotoListItem[] {
  const copy = [...photos];
  switch (sort) {
    case PhotoSort.DATE_DESC:
      return copy.sort(byDate(-1));
    case PhotoSort.AESTHETICS_DESC:
      return copy.sort((a, b) => (b.aestheticsScore ?? -1) - (a.aestheticsScore ?? -1));
    case PhotoSort.ALBUM:
      return copy.sort(
        (a, b) =>
          (a.albumPath ?? '').localeCompare(b.albumPath ?? '', 'fr') ||
          a.fileName.localeCompare(b.fileName, 'fr'),
      );
    default:
      return copy.sort(byDate(1));
  }
}

function byDate(direction: 1 | -1) {
  return (a: PhotoListItem, b: PhotoListItem): number => {
    if (a.date === null && b.date === null) return 0;
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return direction * a.date.start.localeCompare(b.date.start);
  };
}

/**
 * Builds the detail view of a fixture photo. The proposal and the doubt are
 * separate first-level blocks (spec §9.2), never folded into the date.
 */
function detailFor(photo: PhotoListItem) {
  const isProposal = photo.date?.source === DateSource.LOGBOOK_BRACKET;
  const missingFile = photo.fileName === 'sans-vignette.jpg';

  return {
    ...photo,
    albumPaths: photo.albumPath === null ? [] : [photo.albumPath, 'all pics'],
    tags: [...(PHOTO_TAGS[photo.cloudAssetId] ?? [])],
    exif: {
      cameraMake: 'NIKON', cameraModel: 'E5700', lens: null, iso: 100,
      aperture: 4.5, shutter: '1/350', focalLength: 8.9, altitude: null,
    },
    ocrText: PHOTO_OCR[photo.cloudAssetId] ?? null,
    fileSize: 778_000,
    relativePath: `${photo.albumPath ?? 'racine'}/${photo.fileName}`,
    proposal: isProposal && photo.date !== null
      ? {
          date: photo.date,
          position: photo.position,
          evidenceEntryIds: ['logbook/1999-12-07', 'logbook/1999-12-11'],
        }
      : null,
    doubt: photo.date === null
      ? {
          reason: 'no-place-in-name',
          label: 'Le nom de l’album ne nomme aucun lieu',
          albumPath: photo.albumPath ?? '',
          candidates: [],
        }
      : null,
    overlappingTextCount: isProposal ? 7 : 0,
    // Spec §7.1's third extension: a DEDUCTION from appearance, its own
    // register — never the excerpt above, which only exists to explain a
    // search hit. NULL until the captioning pass has covered this photo.
    caption: photo.hasCaption
      ? {
          text: photo.captionExcerpt?.text ?? 'Photo sans description disponible.',
          keywords: ['bateau', 'famille', 'voyage'],
          kind: 'machine' as const,
          model: 'claude-fable-5',
          promptVersion: 'v3',
          createdAt: NOW,
          machineOriginal: null,
        }
      : null,
    render: missingFile
      ? { available: false, unavailableReason: 'source_file_missing' as const, cached: false }
      : { available: true, unavailableReason: null, cached: true },
  };
}
