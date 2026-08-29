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
import { DateSource, ErrorCode, PhotoSort, SelectionReason, TaskState } from '../src/shared/enums';
import type { TaskDetail } from '../src/api/contract/task';
import type { Job } from '../src/api/contract/job';

import { store } from './store';
import { INVARIANT_ALBUMS } from '../fixtures/invariants/albums';
import {
  INVARIANT_DOCUMENTS, INVARIANT_PAGES, INVARIANT_TEXTS,
} from '../fixtures/invariants/texts';

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

const NOW = '2026-08-29T10:00:00.000Z' as TaskDetail['createdAt'];

export const handlers = [
  // Contract §4.2: the 82 albums fit in one response.
  http.get('*/albums', () => HttpResponse.json({ items: INVARIANT_ALBUMS })),

  http.get('*/documents', () => HttpResponse.json({ items: INVARIANT_DOCUMENTS })),

  http.get('*/pages', ({ request }) => {
    const documentId = new URL(request.url).searchParams.get('documentId');
    return HttpResponse.json({
      items: INVARIANT_PAGES.filter((p) => documentId === null || p.documentId === documentId),
    });
  }),

  http.get('*/texts', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const documentId = params.get('documentId');
    const pageId = params.get('pageId');
    const query = params.get('q');

    let kept = [...INVARIANT_TEXTS];
    if (documentId !== null) kept = kept.filter((t) => t.documentId === documentId);
    if (pageId !== null) kept = kept.filter((t) => t.pageId === pageId);
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
      populationTotal: INVARIANT_TEXTS.length,
      excludedCount: INVARIANT_TEXTS.length - kept.length,
      filters: {
        applied: [...params.keys()].map((parameter) => ({
          parameter, values: params.getAll(parameter), broadened: false,
        })),
        unmatchedValues: [],
      },
      importId: store.importId,
    });
  }),

  http.post('*/tasks/:slug/export', async ({ params, request }) => {
    const slug = String(params['slug']);
    const task = store.tasks.get(slug);
    if (task === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Tâche introuvable.', { resource: 'task', id: slug });
    }
    const body = (await request.json()) as { overwrite: boolean };

    // Never overwrite in silence: name the directory and let the user choose.
    if (store.exportDirectoryExists && !body.overwrite) {
      return error(409, ErrorCode.TARGET_DIRECTORY_EXISTS, 'Le dossier existe déjà.', {
        directory: `/tasks/${slug}`,
      });
    }

    // One image will not render. The export continues without it, and the
    // report names it with its cause.
    const unrenderable = task.images.filter((i) =>
      store.photos.some((p) => p.cloudAssetId === i.cloudAssetId && p.fileName === 'sans-vignette.jpg'),
    );

    const job: Job = {
      jobId: `job_${slug}`,
      type: 'export',
      state: 'succeeded',
      done: task.images.length,
      total: task.images.length,
      startedAt: NOW,
      endedAt: NOW,
      report: {
        directory: `/tasks/${slug}`,
        written: task.images.length - unrenderable.length,
        skipped: unrenderable.map((i) => ({
          cloudAssetId: i.cloudAssetId,
          fileName: 'sans-vignette.jpg',
          reason: 'source_file_missing',
        })),
        partial: false,
      },
    };
    store.jobs.set(job.jobId, job);
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
        .map(({ images: _images, brief: _brief, ...summary }) => summary)
        // The most recently opened first. Spec §5.1.
        .sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? '')),
    }),
  ),

  http.get('*/tasks/:slug', ({ params }) => {
    const task = store.tasks.get(String(params['slug']));
    if (task === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Tâche introuvable.', {
        resource: 'task', id: String(params['slug']),
      });
    }
    return HttpResponse.json(task);
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
    };
    store.tasks.set(body.slug, created);
    return HttpResponse.json(created, { status: 201 });
  }),

  http.post('*/tasks/:slug/images', async ({ params, request }) => {
    const task = store.tasks.get(String(params['slug']));
    if (task === undefined) {
      return error(404, ErrorCode.NOT_FOUND, 'Tâche introuvable.', {
        resource: 'task', id: String(params['slug']),
      });
    }
    const body = (await request.json()) as {
      add?: string[]; remove?: string[]; selectedBecause?: SelectionReason[];
    };

    const held = new Set(task.images.map((i) => i.cloudAssetId));
    const added: string[] = [];
    const merged: string[] = [];
    const rejected: { cloudAssetId: string; reason: string }[] = [];

    for (const id of body.add ?? []) {
      if (!store.photos.some((p) => p.cloudAssetId === id)) {
        rejected.push({ cloudAssetId: id, reason: 'unknown_photo' });
        continue;
      }
      // Set union: re-adding is an idempotent success, never a rejection.
      if (held.has(id)) { merged.push(id); continue; }
      held.add(id);
      added.push(id);
      task.images.push({
        cloudAssetId: id, order: task.images.length, note: null,
        selectedBecause: body.selectedBecause ?? [SelectionReason.MANUAL],
        selectedAt: NOW, orphaned: false,
      });
    }

    const removing = new Set(body.remove ?? []);
    const removed = task.images.filter((i) => removing.has(i.cloudAssetId)).map((i) => i.cloudAssetId);
    task.images = task.images.filter((i) => !removing.has(i.cloudAssetId));
    task.imageCount = task.images.length;

    return HttpResponse.json({
      added, removed, merged, rejected, warnings: [], imageCount: task.images.length,
    });
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
    tags: [
      { name: 'boat', confidence: 71 },
      { name: 'maya', confidence: 58 },
      { name: 'famille', confidence: null },
    ],
    exif: {
      cameraMake: 'NIKON', cameraModel: 'E5700', lens: null, iso: 100,
      aperture: 4.5, shutter: '1/350', focalLength: 8.9, altitude: null,
    },
    ocrText: null,
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
    render: missingFile
      ? { available: false, unavailableReason: 'source_file_missing' as const, cached: false }
      : { available: true, unavailableReason: null, cached: true },
  };
}
