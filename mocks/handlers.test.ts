import { setupServer } from 'msw/node';

import { apiGet, ApiError } from '../src/api/client';
import { PhotoOverlapEnvelopeSchema, TextOverlapEnvelopeSchema } from '../src/api/contract/overlap';
import { ListEnvelopeSchema, PhotoListItemSchema } from '../src/api/contract/photo';

import { handlers } from './handlers';
import { resetStore } from './store';

const server = setupServer(...handlers);
beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
afterEach(() => { server.resetHandlers(); resetStore(); });
afterAll(() => { server.close(); });

const Photos = ListEnvelopeSchema(PhotoListItemSchema);
const photos = (query = '') => apiGet(`/photos${query}`, Photos);
const photosWithOverlap = (query = '') => apiGet(`/photos${query}`, PhotoOverlapEnvelopeSchema);
const overlappingTexts = (cloudAssetId: string) =>
  apiGet(`/photos/${cloudAssetId}/texts`, TextOverlapEnvelopeSchema);

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
