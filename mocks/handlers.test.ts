import { setupServer } from 'msw/node';

import { apiDeleteWithBody, apiGet, apiPost, apiPut, ApiError } from '../src/api/client';
import { PhotoOverlapEnvelopeSchema, TextOverlapEnvelopeSchema } from '../src/api/contract/overlap';
import { ListEnvelopeSchema, PhotoFacetsSchema, PhotoListItemSchema } from '../src/api/contract/photo';
import { AlbumSpanUpdateResultSchema, WebDocumentListSchema } from '../src/api/contract/ref';
import { TaskReviewSchema } from '../src/api/contract/review';
import { TaskDeleteResultSchema, TaskDetailSchema } from '../src/api/contract/task';
import { TextDocumentSchema } from '../src/api/contract/text';
import { SystemStatusSchema } from '../src/api/contract/system';
import { parseIsoDate, parseIsoTimestamp } from '../src/shared/date_interface';

import { handlers } from './handlers';
import { store, resetStore } from './store';

const server = setupServer(...handlers);
beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
afterEach(() => { server.resetHandlers(); resetStore(); });
afterAll(() => { server.close(); });

const Photos = ListEnvelopeSchema(PhotoListItemSchema);
const photos = (query = '') => apiGet(`/photos${query}`, Photos);
const photosWithOverlap = (query = '') => apiGet(`/photos${query}`, PhotoOverlapEnvelopeSchema);
const overlappingTexts = (cloudAssetId: string) =>
  apiGet(`/photos/${cloudAssetId}/texts`, TextOverlapEnvelopeSchema);
const facets = (query = '') => apiGet(`/photos/facets${query}`, PhotoFacetsSchema);
const putAlbumSpan = (input: {
  albumPath: string; dateFrom: string; dateTo: string; note: string | null;
}) =>
  apiPut('/ref/album-span', {
    ...input, dateFrom: parseIsoDate(input.dateFrom), dateTo: parseIsoDate(input.dateTo),
  }, AlbumSpanUpdateResultSchema);
const deleteAlbumSpan = (albumPath: string) =>
  apiDeleteWithBody('/ref/album-span', { albumPath }, AlbumSpanUpdateResultSchema);
const webDocuments = () => apiGet('/ref/web-documents', WebDocumentListSchema);
const putWebSpan = (input: {
  documentId: string; dateFrom: string; note: string | null;
}) =>
  apiPut('/ref/web-span', {
    ...input, dateFrom: parseIsoDate(input.dateFrom),
  }, TextDocumentSchema);
const review = (slug: string) => apiGet(`/tasks/${slug}/review`, TaskReviewSchema);
const systemStatus = () => apiGet('/system/status', SystemStatusSchema);

describe('the envelope obeys the contract', () => {
  test('an unfiltered call returns the whole hierarchy scope', async () => {
    const page = await photos();
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.total).toBe(page.items.length);
    expect(page.excludedCount).toBe(0);
  });

  test('INVARIANT §9.6.8 — total and page are two things', async () => {
    const page = await photos('?limit=2');
    expect(page.items).toHaveLength(2);
    expect(page.total).toBeGreaterThan(2);
  });

  test('INVARIANT §7.3 — excludedCount is populationTotal minus total', async () => {
    const page = await photos('?dateFrom=2004-01-01&dateTo=2004-12-31');
    expect(page.excludedCount).toBe(page.populationTotal - page.total);
  });
});

describe('INVARIANT §9.6.1 — a filter never disappears', () => {
  test('an unknown parameter is a 400 naming it and listing what is accepted', async () => {
    const thrown = (await photos('?colour=grey').catch((e: unknown) => e)) as ApiError;
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown.status).toBe(400);
    expect(thrown.code).toBe('UNKNOWN_PARAMETER');
    expect(thrown.details).toMatchObject({ parameters: ['colour'] });
    expect((thrown.details as { accepted: string[] }).accepted).toContain('albumPath');
  });

  test('an invalid value in a CLOSED vocabulary is a 400', async () => {
    const thrown = (await photos('?sort=weekly').catch((e: unknown) => e)) as ApiError;
    expect(thrown.code).toBe('INVALID_PARAMETER');
    expect(thrown.details).toMatchObject({ parameter: 'sort', received: 'weekly' });
  });

  test('an unknown value in an OPEN vocabulary is 200 with zero results, not a 400', async () => {
    const page = await photos('?albumPath=2099%2Fnexiste-pas');
    expect(page.total).toBe(0);
    expect(page.filters.unmatchedValues).toEqual([
      expect.objectContaining({ parameter: 'albumPath', value: '2099/nexiste-pas' }),
    ]);
  });

  test('every applied filter is reported back, none silently dropped', async () => {
    const page = await photos('?dateFrom=2000-01-01&dateTo=2000-12-31');
    expect(page.filters.applied.map((f) => f.parameter).sort()).toEqual(['dateFrom', 'dateTo']);
  });
});

describe('INVARIANT §7.3 — the date filter overlaps, it never contains', () => {
  // The measured case: the December album holds photos dated to the whole
  // month. A strict reading returns none of them; overlap returns them.
  test('a fortnight filter keeps a photo dated to the whole month', async () => {
    const page = await photos('?dateFrom=2000-12-01&dateTo=2000-12-20');
    expect(page.items.map((p) => p.albumPath)).toContain(
      '2000-2001/2000-12-viree au Venezuela-3mois',
    );
  });

  test('a year-precision photo is kept by a single-day filter inside that year', async () => {
    const page = await photos('?dateFrom=2000-07-04&dateTo=2000-07-04');
    expect(page.items.some((p) => p.date?.precision === 'year')).toBe(true);
  });

  test('a photo with no date is excluded by a date filter, and counted as excluded', async () => {
    const page = await photos('?dateFrom=1999-01-01&dateTo=1999-12-31');
    expect(page.items.every((p) => p.date !== null)).toBe(true);
    expect(page.excludedCount).toBeGreaterThan(0);
  });
});

describe('the mock shares the application\'s semantics, not its own', () => {
  test('sorting by date groups the undated photos at the end', async () => {
    const page = await photos('?sort=date_asc');
    const firstUndated = page.items.findIndex((p) => p.date === null);
    if (firstUndated !== -1) {
      expect(page.items.slice(firstUndated).every((p) => p.date === null)).toBe(true);
    }
  });
});

describe('contract §4.2/§4.3 — the recouvrement axis, both directions', () => {
  test('"which photos does this text cover?" adds overlap to each item, and a summary', async () => {
    // logbook/p003/001 (passage) asserts no date of its own; its window comes
    // from the page (1999-12-08 → 1999-12-12), spanSource ENTRIES.
    const page = await photosWithOverlap(
      '?overlapsTextKind=passage&overlapsTextId=logbook%2Fp003%2F001',
    );
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((p) => p.overlap.rule === 'passage')).toBe(true);
    expect(page.overlapSummary.matchCount).toBe(page.items.length);
    expect(page.overlapSummary.windowDays).toBe(5); // 08..12 December, inclusive
  });

  test('an unknown text reference is a 404, never an empty result', async () => {
    const thrown = (await photosWithOverlap(
      '?overlapsTextKind=passage&overlapsTextId=nope',
    ).catch((e: unknown) => e)) as ApiError;
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown.status).toBe(404);
  });

  test('a text with no window at all matches nothing, without erroring', async () => {
    // web/2003/2003_gal_1/001: no date, no page, and the fixture document's
    // span is null.
    const page = await photosWithOverlap(
      '?overlapsTextKind=passage&overlapsTextId=web%2F2003%2F2003_gal_1%2F001',
    );
    expect(page.items).toEqual([]);
    expect(page.overlapSummary.matchCount).toBe(0);
  });

  test('"which texts cover this photo?" is the SAME predicate, the other way round', async () => {
    // Dated 1999-12-08, inside logbook/p003's window — the same pair the
    // above test reaches from the text side.
    const page = await overlappingTexts('2b3c4d5e6f708192a3b4c5d6e7f80911');
    expect(page.items.some((t) => t.ref.id === 'logbook/p003/001')).toBe(true);
  });

  test('a photo with no date covers nothing, without erroring', async () => {
    const page = await overlappingTexts('708192a3b4c5d6e7f809112233445566');
    expect(page.items).toEqual([]);
    expect(page.overlapSummary.matchCount).toBe(0);
  });
});

describe('contract §11 Q11 — a gallery caption matches its photo DIRECTLY, never by date', () => {
  const TIKAL_PHOTO = '8192a3b4c5d6e7f80911223344556677';
  const TIKAL_CAPTION = 'web/2003/2003_gal_1/caption/000a86651c47';

  test('"which photos does this caption cover?" returns exactly the one matched photo', async () => {
    const page = await photosWithOverlap(
      `?overlapsTextKind=web_caption&overlapsTextId=${encodeURIComponent(TIKAL_CAPTION)}`,
    );
    expect(page.items.map((p) => p.cloudAssetId)).toEqual([TIKAL_PHOTO]);
    expect(page.items[0]?.overlap).toEqual({
      rule: 'gallery_match', photoSpanDays: 0, textSpanDays: 0,
      totalSpanDays: 0, distanceToCentreDays: 0,
    });
  });

  test('"which texts cover this photo?" finds the caption by sha256, alongside any date overlap', async () => {
    const page = await overlappingTexts(TIKAL_PHOTO);
    const caption = page.items.find((t) => t.ref.id === TIKAL_CAPTION);
    expect(caption?.overlap.rule).toBe('gallery_match');
  });

  test('a caption whose match falls outside the current filter matches nothing', async () => {
    const page = await photosWithOverlap(
      `?overlapsTextKind=web_caption&overlapsTextId=${encodeURIComponent(TIKAL_CAPTION)}` +
      '&albumPath=1998-1999%2F1999-10 Lisboa Madere',
    );
    expect(page.items).toEqual([]);
  });
});

describe('T3 — the content axes: tag, person, place, hasPosition/OCR/caption, q', () => {
  test('tag filters to photos carrying it', async () => {
    const page = await photos('?tag=ruines');
    expect(page.items.map((p) => p.fileName)).toEqual(['DSCN2201.jpg']);
  });

  test('a tag with no confidence still matches — it is never excluded', async () => {
    const page = await photos('?tag=souvenir');
    expect(page.items).toHaveLength(1);
  });

  test('person filters to photos naming them', async () => {
    const page = await photos('?person=Ghislaine');
    expect(page.items.map((p) => p.fileName)).toEqual(['PICT0107.jpg']);
  });

  test('country matches the EXIF place directly', async () => {
    const page = await photos('?country=Portugal');
    expect(page.items.map((p) => p.fileName)).toContain('PICT0042.jpg');
  });

  test('§5.3 generous reading — a photo with no EXIF place still answers by album name', async () => {
    // Maison rose Algès carries no place.country; the album name does.
    const page = await photos('?country=Alg%C3%A8s');
    const match = page.items.find((p) => p.fileName === '98-99 maison rose Lisbonne (N).jpg');
    expect(match).toBeDefined();
    expect(match?.matchedOn.some((m) => m.field === 'album_path')).toBe(true);
  });

  test('hasPosition keeps only photos carrying one', async () => {
    const page = await photos('?hasPosition=true');
    expect(page.items.every((p) => p.position !== null)).toBe(true);
    expect(page.items.length).toBeGreaterThan(0);
  });

  test('hasOcr keeps only photos with text printed in the image', async () => {
    const page = await photos('?hasOcr=true');
    expect(page.items.map((p) => p.fileName)).toEqual(['PICT0233.jpg']);
  });

  test('hasCaption keeps only photos a machine caption covers', async () => {
    const page = await photos('?hasCaption=true');
    expect(page.items.map((p) => p.fileName)).toEqual(['DSCN2201.jpg']);
  });

  test('q searches broadly — file name, album, people, tags, caption', async () => {
    const page = await photos('?q=ruines');
    expect(page.items.map((p) => p.fileName)).toEqual(['DSCN2201.jpg']);
  });

  test('an empty q is zero results, never the whole corpus', async () => {
    const page = await photos('?q=');
    expect(page.items).toEqual([]);
  });

  test('reliableDatesOnly restricts to day-precision dates', async () => {
    const page = await photos('?reliableDatesOnly=true');
    expect(page.items.every((p) => p.date?.precision === 'day')).toBe(true);
    expect(page.items.length).toBeGreaterThan(0);
  });
});

describe('T3 — /photos/facets, contextual counts against the current filter', () => {
  test('tags are sorted by selectivity ascending — the rarest first', async () => {
    const page = await facets();
    const counts = page.tags.map((t) => t.count);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  test('a lying place tag never enters the offered vocabulary', async () => {
    const page = await facets();
    expect(page.tags.some((t) => t.value === 'italy')).toBe(false);
  });

  test('the lying tag is still searchable directly, marked or not', async () => {
    const page = await photos('?tag=italy');
    expect(page.items.map((p) => p.fileName)).toEqual(['DSCN2201.jpg']);
  });

  test('facets are recomputed against the current filter, not the whole population', async () => {
    const all = await facets();
    const filtered = await facets('?albumPath=1998-1999%2F1999-12 Capvert Guadeloupe');
    expect(filtered.tags.length).toBeLessThan(all.tags.length);
  });

  test('positionedCount is 0 when nothing in the filter has a position', async () => {
    const page = await facets('?albumPath=1998-1999%2F1999-10 Lisboa Madere');
    expect(page.positionedCount).toBe(0);
  });
});

describe('contract §4.8 — PUT/DELETE /ref/album-span, the highest-yield screen', () => {
  const ALBUM = '1998-1999/1999-10 Lisboa Madere';

  test('a valid span is saved, presumed flips to false', async () => {
    const result = await putAlbumSpan({
      albumPath: ALBUM, dateFrom: '1999-10-05', dateTo: '1999-10-20', note: 'Corrigé',
    });
    expect(result.album.span).toMatchObject({
      from: '1999-10-05', to: '1999-10-20', presumed: false, note: 'Corrigé',
    });
    expect(result.recomputed.photosAffected).toBe(result.album.photoCount);
    expect(result.warnings).toEqual([]);
  });

  test('dateTo before dateFrom is a 400, never silently swapped', async () => {
    const thrown = (await putAlbumSpan({
      albumPath: ALBUM, dateFrom: '1999-10-20', dateTo: '1999-10-05', note: null,
    }).catch((e: unknown) => e)) as ApiError;
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown.code).toBe('INVALID_PARAMETER');
  });

  test('an unknown album is a 404', async () => {
    const thrown = (await putAlbumSpan({
      albumPath: 'nope/nope', dateFrom: '1999-01-01', dateTo: '1999-01-31', note: null,
    }).catch((e: unknown) => e)) as ApiError;
    expect(thrown.status).toBe(404);
  });

  test('a span outside the prefix year is ACCEPTED, with a warning', async () => {
    const result = await putAlbumSpan({
      albumPath: ALBUM, dateFrom: '1995-01-01', dateTo: '1995-01-31', note: null,
    });
    expect(result.warnings).toEqual([{ code: 'outside_prefix_year', prefixYear: 1999 }]);
  });

  test('a span overlapping another album is ACCEPTED, with a warning naming it', async () => {
    // Starts the day after "Maison rose Algès" ends (1999-06-30), so this
    // overlaps ONLY the 2000 Venezuela album.
    const result = await putAlbumSpan({
      albumPath: ALBUM, dateFrom: '1999-07-01', dateTo: '2000-06-30', note: null,
    });
    expect(result.warnings).toContainEqual({ code: 'overlaps_album', albumPath: '2000-2001/2000' });
  });

  test('DELETE reverts to the prefix-derived span, never the entered one with a flag flipped', async () => {
    await putAlbumSpan({ albumPath: ALBUM, dateFrom: '1999-10-05', dateTo: '1999-10-20', note: 'x' });
    const result = await deleteAlbumSpan(ALBUM);
    expect(result.album.span).toEqual({
      from: '1999-10-01', to: '1999-10-31', presumed: true, note: null,
    });
  });
});

describe('contract §4.8 — /ref/web-documents and PUT/DELETE /ref/web-span', () => {
  test('web documents are listed with their path as the date hint', async () => {
    const page = await webDocuments();
    const doc = page.items.find((d) => d.documentId === 'web/2003/2003_gal_1');
    expect(doc).toBeDefined();
    expect(doc?.pathHint).toBe('web/2003/2003_gal_1');
  });

  test('a saved web_span is an INFERENCE, never a decision — the capital rule', async () => {
    const doc = await putWebSpan({
      documentId: 'web/2003/2003_gal_1', dateFrom: '2003-01-01', note: 'Nicolas',
    });
    expect(doc.span).toMatchObject({ kind: 'inference', source: 'web_span' });
  });

  test('an unknown document is a 404', async () => {
    const thrown = (await putWebSpan({
      documentId: 'nope', dateFrom: '2003-01-01', note: null,
    }).catch((e: unknown) => e)) as ApiError;
    expect(thrown.status).toBe(404);
  });
});

describe('contract §7.3 — GET /tasks/:slug/review, the eight counters and the timeline', () => {
  test('an unknown task is a 404', async () => {
    const thrown = (await review('nope').catch((e: unknown) => e)) as ApiError;
    expect(thrown.status).toBe(404);
  });

  test('the seed task: one dated image, no text covers it, no text selected yet', async () => {
    const page = await review('1999-transat');
    expect(page.images).toHaveLength(1);
    expect(page.images[0]?.selection.cloudAssetId).toBe('e8bc80b75e254b7db2e1454222416813');
    expect(page.texts).toEqual([]);
    expect(page.warnings.imagesWithoutText).toBe(1);
    expect(page.warnings.undatedImages).toBe(0);
  });

  test('the timeline carries the image, with its own bounds and nature', async () => {
    const page = await review('1999-transat');
    expect(page.timeline).toEqual([
      { kind: 'image', id: 'e8bc80b75e254b7db2e1454222416813', start: '1999-03-02', end: '1999-03-02', precision: 'day', dateKind: 'decision' },
    ]);
  });

  test('selecting a text adds it to the review and its own timeline entry', async () => {
    const task = store.tasks.get('1999-transat');
    task?.texts.push({
      ref: { kind: 'log_entry', id: 'logbook/p003/001' },
      order: 0, selectedAt: parseIsoTimestamp('2026-08-29T10:00:00.000Z'), orphaned: false,
      startOffset: null, endOffset: null,
    });

    const page = await review('1999-transat');
    expect(page.texts).toHaveLength(1);
    expect(page.timeline.some((e) => e.kind === 'text' && e.start === '1999-12-08')).toBe(true);
  });

  test('an orphaned image selection is counted and excluded from the enriched list', async () => {
    const task = store.tasks.get('1999-transat');
    task?.images.push({
      cloudAssetId: 'ffffffffffffffffffffffffffffffff',
      order: 1, note: null, selectedBecause: ['manual'],
      selectedAt: parseIsoTimestamp('2026-08-29T10:00:00.000Z'), orphaned: false,
      outOfPeriod: false,
    });

    const page = await review('1999-transat');
    expect(page.warnings.orphanedImages).toBe(1);
    expect(page.images.some((i) => i.cloudAssetId === 'ffffffffffffffffffffffffffffffff')).toBe(false);
  });

  test('imagesOutOfPeriod counts against the task period, when one is set', async () => {
    const task = store.tasks.get('1999-transat');
    if (task !== undefined) task.period = { from: parseIsoDate('2000-01-01'), to: parseIsoDate('2000-12-31') };

    const page = await review('1999-transat');
    expect(page.warnings.imagesOutOfPeriod).toBe(1);
  });
});

describe('contract §4.5 — duplicating and deleting a task', () => {
  test('duplicating copies the brief and period, starts empty otherwise', async () => {
    const created = await apiPost(
      '/tasks/1999-transat/duplicate', { title: 'Copie', slug: '1999-transat-copie' }, TaskDetailSchema,
    );
    expect(created.title).toBe('Copie');
    expect(created.imageCount).toBe(0);
    expect(created.texts).toEqual([]);
  });

  test('duplicating onto a taken slug is refused', async () => {
    const thrown = (await apiPost(
      '/tasks/1999-transat/duplicate', { title: 'x', slug: '1999-transat' }, TaskDetailSchema,
    ).catch((e: unknown) => e)) as ApiError;
    expect(thrown.status).toBe(409);
    expect(thrown.code).toBe('SLUG_TAKEN');
  });

  test('duplicating an unknown task is a 404', async () => {
    const thrown = (await apiPost(
      '/tasks/nope/duplicate', { title: 'x', slug: 'y' }, TaskDetailSchema,
    ).catch((e: unknown) => e)) as ApiError;
    expect(thrown.status).toBe(404);
  });

  test('deleting removes the task, and never touches an exported directory', async () => {
    const task = store.tasks.get('1999-transat');
    if (task !== undefined) task.exportDirectory = '/tasks/1999-transat';

    const result = await apiDeleteWithBody('/tasks/1999-transat', {}, TaskDeleteResultSchema);
    expect(result).toEqual({ deleted: true, exportDirectoryKept: '/tasks/1999-transat' });
    expect(store.tasks.has('1999-transat')).toBe(false);
  });

  test('deleting an unknown task is a 404', async () => {
    const thrown = (await apiDeleteWithBody('/tasks/nope', {}, TaskDeleteResultSchema)
      .catch((e: unknown) => e)) as ApiError;
    expect(thrown.status).toBe(404);
  });
});

describe('contract §4.1/§9 — GET /system/status, the ONE global banner', () => {
  test('originals available by default', async () => {
    const status = await systemStatus();
    expect(status.roots.find((r) => r.name === 'originals')?.available).toBe(true);
  });

  test('a simulated unmount is reflected', async () => {
    store.originalsAvailable = false;
    const status = await systemStatus();
    expect(status.roots.find((r) => r.name === 'originals')?.available).toBe(false);
  });

  test('attention.albumsWithPresumedSpan counts the still-presumed albums', async () => {
    const status = await systemStatus();
    // Fixture: 4 of the 5 albums are still presumed (not yet typed) —
    // "Maison rose Algès" is the only one with a saisi span.
    expect(status.attention.albumsWithPresumedSpan).toBe(4);
  });
});
