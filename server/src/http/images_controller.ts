import path from 'node:path';

import type { FastifyInstance } from 'fastify';

import { ErrorCode } from '@shared/enums';
import { AppError } from '../contract/error_interface.ts';
import type { Pool } from '../db/pool.ts';
import { getRender, getThumb, type ImageServiceDeps } from '../metier/images/image_service.ts';
import type { RenderFailure } from '../metier/images/render_availability.ts';
import { findPhotoBySha256, type PhotoBySha } from '../repository/photo_repository.ts';
import { parseQueryParams } from './query_params.ts';

const SHA256 = /^[0-9a-f]{64}$/;

/** `1400` seul en V1 (contrat §6.2) — un vocabulaire fermé, pas une plage. */
const RENDER_EDGE_VALUES = ['1400'] as const;

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export interface ImagesRoutesDeps {
  readonly pool: Pool;
  /** Construit UNE fois par `bootstrap.ts`, partagé avec l'export et le pré-rendu — un seul `InFlightRenders` par processus. */
  readonly imageService: ImageServiceDeps;
}

/**
 * Traduit le classifieur des trois échecs (`metier/images/render_availability.ts`)
 * en `AppError` — la même triade que le contrat §6.2, jamais confondue.
 */
function failureToError(
  failure: RenderFailure, photo: PhotoBySha, expectedRoot: string, envVar: string,
): AppError {
  switch (failure) {
    case 'VOLUME_UNAVAILABLE':
      return new AppError(ErrorCode.VOLUME_UNAVAILABLE, `volume indisponible : ${envVar}`, 503,
        { root: expectedRoot, envVar });
    case 'SOURCE_FILE_MISSING':
      return new AppError(ErrorCode.SOURCE_FILE_MISSING, `fichier source manquant`, 404,
        { cloudAssetId: photo.cloudAssetId, expectedPath: path.join(expectedRoot, photo.relativePath) });
    case 'NOT_RENDERABLE':
      return new AppError(ErrorCode.NOT_RENDERABLE, `format sans pixel : ${photo.format}`, 415,
        { cloudAssetId: photo.cloudAssetId, format: photo.format });
  }
}

async function resolvePhoto(pool: Pool, sha256: string): Promise<PhotoBySha> {
  if (!SHA256.test(sha256)) {
    throw new AppError(ErrorCode.NOT_FOUND, `sha256 invalide : ${sha256}`, 404, { resource: 'image', id: sha256 });
  }
  const client = await pool.connect();
  let photo: PhotoBySha | null;
  try {
    photo = await findPhotoBySha256(client, sha256);
  } finally {
    client.release();
  }
  if (photo === null) {
    throw new AppError(ErrorCode.NOT_FOUND, `aucune photo pour ce sha256 : ${sha256}`, 404,
      { resource: 'image', id: sha256 });
  }
  return photo;
}

export function registerImagesRoutes(server: FastifyInstance, deps: ImagesRoutesDeps): void {
  const { pool, imageService } = deps;
  const { thumbsRoot, originalsRoot } = imageService;

  server.get('/images/:sha256/thumb', async (request, reply) => {
    const { sha256 } = request.params as { sha256: string };
    const photo = await resolvePhoto(pool, sha256);

    const result = await getThumb(imageService, sha256);
    if (result.failure !== null) throw failureToError(result.failure, photo, thumbsRoot, 'THUMBS_ROOT');

    void reply.header('Cache-Control', IMMUTABLE_CACHE_CONTROL);
    void reply.header('ETag', `"${sha256}"`);
    void reply.type('image/jpeg');
    return result.buffer;
  });

  server.get('/images/:sha256/render', async (request, reply) => {
    const { sha256 } = request.params as { sha256: string };
    const parsed = parseQueryParams(request.query as Record<string, unknown>, {
      edge: { kind: 'closed', values: RENDER_EDGE_VALUES, fallback: RENDER_EDGE_VALUES[0] },
    });
    const edge = Number(parsed.edge);

    const photo = await resolvePhoto(pool, sha256);

    const result = await getRender(imageService, sha256, photo, edge);
    if (result.failure !== null) throw failureToError(result.failure, photo, originalsRoot, 'ORIGINALS_ROOT');

    void reply.header('Cache-Control', IMMUTABLE_CACHE_CONTROL);
    void reply.header('ETag', `"${sha256}-${String(edge)}"`);
    void reply.type('image/jpeg');
    return result.buffer;
  });
}
