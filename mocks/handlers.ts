/**
 * MSW handlers implementing the frozen contract.
 *
 * These deliberately import the SAME `overlaps` and the same schemas the
 * application uses. A mock with its own semantics would make every component
 * test validate a fiction.
 */
import { http, HttpResponse } from 'msw';

import { overlaps } from '../src/domain/interval';
import type { PhotoListItem } from '../src/api/contract/photo';
import { isIsoDate } from '../src/shared/date_interface';
import { ErrorCode, PhotoSort } from '../src/shared/enums';

import { store } from './store';
import { INVARIANT_ALBUMS } from '../fixtures/invariants/albums';

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

interface UnmatchedValue {
  parameter: string;
  value: string;
  nearest: string[];
}

export const handlers = [
  // Contract §4.2: the 82 albums fit in one response.
  http.get('*/albums', () => HttpResponse.json({ items: INVARIANT_ALBUMS })),

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

    kept = sortPhotos(kept, sort);

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
