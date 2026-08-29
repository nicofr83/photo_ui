import { access } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';

import { ErrorCode } from '@shared/enums';
import { AppError } from '../contract/error_interface.ts';
import type { ListEnvelope } from '../contract/filter_interface.ts';
import type { PhotoDetail, PhotoListItem } from '../contract/photo_interface.ts';
import type { Pool } from '../db/pool.ts';
import type { Config } from '../runtime/config.ts';
import { classifyRenderFailure } from '../metier/images/render_availability.ts';
import { getLatestImportId } from '../repository/import_run_repository.ts';
import { getPhotoDetail, listPhotos, type PhotoFilters } from '../repository/photo_repository.ts';
import { parseQueryParams, type ParamSpec } from './query_params.ts';

const CLOUD_ASSET_ID = /^[0-9a-f]{32}$/;

const PHOTOS_PARAM_SPEC: ParamSpec = {
  scope: { kind: 'closed', values: ['hierarchy', 'out_of_hierarchy', 'all'], fallback: 'hierarchy' },
  dateFrom: { kind: 'isoDate' },
  dateTo: { kind: 'isoDate' },
  reliableDatesOnly: { kind: 'boolean', fallback: false },
  albumPath: { kind: 'openList' },
  tag: { kind: 'openList' },
  tagMinConfidence: { kind: 'integer' },
  person: { kind: 'openList' },
  country: { kind: 'openList' },
  city: { kind: 'openList' },
  hasPosition: { kind: 'boolean' },
  hasOcr: { kind: 'boolean' },
  hasCaption: { kind: 'boolean' },
  q: { kind: 'open' },
  overlapsTextKind: { kind: 'closed', values: ['passage', 'log_entry', 'web_caption'] },
  overlapsTextId: { kind: 'open' },
  inTask: { kind: 'openList' },
  notInTask: { kind: 'openList' },
  sort: { kind: 'closed', values: ['date_asc', 'date_desc', 'aesthetics_desc', 'album', 'overlap'], fallback: 'date_asc' },
  limit: { kind: 'integer' },
  offset: { kind: 'integer' },
};

/** `overlapsTextKind` et `overlapsTextId` : les deux ensemble ou aucun (contrat §4.2). */
function requireBothOrNeither(parsed: Record<string, unknown>): void {
  const hasKind = parsed.overlapsTextKind !== undefined;
  const hasId = parsed.overlapsTextId !== undefined;
  if (hasKind !== hasId) {
    throw new AppError(
      ErrorCode.INVALID_PARAMETER,
      'overlapsTextKind et overlapsTextId doivent être fournis ensemble, ou aucun des deux',
      400,
      { parameter: hasKind ? 'overlapsTextId' : 'overlapsTextKind', received: undefined, accepted: null },
    );
  }
}

const PHOTO_FILTER_KEYS = [
  'scope', 'dateFrom', 'dateTo', 'reliableDatesOnly', 'albumPath', 'tag', 'tagMinConfidence',
  'person', 'country', 'city', 'hasPosition', 'hasOcr', 'hasCaption', 'q',
  'overlapsTextKind', 'overlapsTextId', 'inTask', 'notInTask', 'sort', 'limit', 'offset',
] as const;

/**
 * `exactOptionalPropertyTypes` refuse d'assigner `undefined` à une propriété
 * optionnelle — la clé doit être ABSENTE, pas présente et vide. `parsed` ne
 * porte que les paramètres réellement fournis (`parseQueryParams` ne pose
 * jamais une clé absente de la requête, sauf un défaut explicite), donc ne
 * recopier que les clés PRÉSENTES suffit à satisfaire la règle.
 */
function toFilters(parsed: Record<string, unknown>): PhotoFilters {
  const filters: Record<string, unknown> = {};
  for (const key of PHOTO_FILTER_KEYS) {
    if (parsed[key] !== undefined) filters[key] = parsed[key];
  }
  return filters;
}

export function registerPhotosRoutes(server: FastifyInstance, deps: { pool: Pool; config: Config }): void {
  const { pool, config } = deps;

  server.get('/photos', async (request): Promise<ListEnvelope<PhotoListItem>> => {
    const parsed = parseQueryParams(request.query as Record<string, unknown>, PHOTOS_PARAM_SPEC);
    requireBothOrNeither(parsed);
    const filters = toFilters(parsed);

    const client = await pool.connect();
    try {
      const [result, importId] = await Promise.all([listPhotos(client, filters), getLatestImportId(client)]);
      return {
        items: result.items,
        total: result.total,
        populationTotal: result.populationTotal,
        excludedCount: result.populationTotal - result.total,
        filters: result.filters,
        importId: importId ?? '',
      };
    } finally {
      client.release();
    }
  });

  server.get('/photos/:cloudAssetId', async (request): Promise<PhotoDetail> => {
    const { cloudAssetId } = request.params as { cloudAssetId: string };
    if (!CLOUD_ASSET_ID.test(cloudAssetId)) {
      throw new AppError(ErrorCode.NOT_FOUND, `identifiant de photo invalide : ${cloudAssetId}`, 404,
        { resource: 'photo', id: cloudAssetId });
    }

    const client = await pool.connect();
    let detail;
    try {
      detail = await getPhotoDetail(client, cloudAssetId);
    } finally {
      client.release();
    }
    if (detail === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `photo introuvable : ${cloudAssetId}`, 404,
        { resource: 'photo', id: cloudAssetId });
    }

    return { ...detail, render: await checkRenderAvailability(config, detail.relativePath, detail.format) };
  });
}

/**
 * Les trois échecs (tâche 15), déterminés AVANT `sips` : le service d'images
 * les recalculera à l'identique pour `/images/:sha256/render` — même
 * classifieur, `metier/images/render_availability.ts`.
 */
async function checkRenderAvailability(
  config: Config, relativePath: string, format: string,
): Promise<PhotoDetail['render']> {
  const rootMounted = await access(config.originalsRoot).then(() => true, () => false);
  const fileExists = !rootMounted ? false
    : await access(path.join(config.originalsRoot, relativePath)).then(() => true, () => false);
  const failure = classifyRenderFailure({ rootMounted, fileExists, format });
  return { available: failure === null, unavailableReason: failure, cached: false };
}
