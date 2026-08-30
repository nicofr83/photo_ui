import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';

import { CorrectionStatus, ErrorCode, TextKind, TranscriptionConfidence } from '@shared/enums';
import { AppError } from '../contract/error_interface.ts';
import type { ListEnvelope } from '../contract/filter_interface.ts';
import type { TextCorrection, TextDateFacets, TextDocument, TextPage, TextUnit } from '../contract/text_interface.ts';
import type { Pool } from '../db/pool.ts';
import { withTransaction } from '../db/transaction.ts';
import type { ImageServiceDeps } from '../metier/images/image_service.ts';
import { getPageThumb, type PageThumbDeps } from '../metier/pages/thumb_service.ts';
import { getTextDateFacets } from '../repository/text_facets.ts';
import {
  getPageImageRelpath, listCorrections, listDocuments, listPages, listTexts, putCorrection, revertCorrection,
  type PageFilters, type TextCorrectionInput, type TextFilters,
} from '../repository/text_repository.ts';
import { parseQueryParams, type ParamSpec } from './query_params.ts';

/** Vocabulaire FERMÉ (contrat §6.1) — une valeur libre laisserait un visiteur remplir le disque de variantes. */
const PAGE_THUMB_EDGE_VALUES = ['160', '320', '640'] as const;

export interface TextsRoutesDeps {
  readonly pool: Pool;
  readonly pagesRoot: string;
  readonly imageService: ImageServiceDeps;
}

const TEXTS_PARAM_SPEC: ParamSpec = {
  documentId: { kind: 'open' },
  pageId: { kind: 'open' },
  kind: { kind: 'closed', values: [TextKind.PASSAGE, TextKind.LOG_ENTRY, TextKind.WEB_CAPTION] },
  dateFrom: { kind: 'isoDate' },
  dateTo: { kind: 'isoDate' },
  overlapsPhoto: { kind: 'open' },
  confidence: {
    kind: 'closed',
    values: [TranscriptionConfidence.TRANSCRIBED, TranscriptionConfidence.REVIEWED, TranscriptionConfidence.UNCERTAIN],
  },
  hasCorrection: { kind: 'boolean' },
  q: { kind: 'open' },
  limit: { kind: 'integer' },
  offset: { kind: 'integer' },
  sort: { kind: 'closed', values: ['page', 'date', 'relevance'], fallback: 'page' },
};

const TEXT_FILTER_KEYS = [
  'documentId', 'pageId', 'kind', 'dateFrom', 'dateTo', 'overlapsPhoto', 'confidence', 'hasCorrection', 'q',
  'limit', 'offset', 'sort',
] as const;

function toFilters(parsed: Record<string, unknown>): TextFilters {
  const filters: Record<string, unknown> = {};
  for (const key of TEXT_FILTER_KEYS) {
    if (parsed[key] !== undefined) filters[key] = parsed[key];
  }
  return filters;
}

const PAGE_FILTER_KEYS = ['documentId', 'dateFrom', 'dateTo', 'q'] as const;

function toPageFilters(parsed: Record<string, unknown>): PageFilters {
  const filters: Record<string, unknown> = {};
  for (const key of PAGE_FILTER_KEYS) {
    if (parsed[key] !== undefined) filters[key] = parsed[key];
  }
  return filters;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function invalidParameter(parameter: string, received: string, message: string): AppError {
  return new AppError(ErrorCode.INVALID_PARAMETER, message, 400, { parameter, received, accepted: null });
}

/** Le même lookup pour `/pages/image` et `/pages/thumb` — un `pageId` inconnu est le même 404 nommé dans les deux. */
async function resolvePageSourcePath(pool: Pool, pagesRoot: string, pageId: string): Promise<string> {
  const client = await pool.connect();
  let relpath: string | null;
  try {
    relpath = await getPageImageRelpath(client, pageId);
  } finally {
    client.release();
  }
  if (relpath === null) {
    throw new AppError(ErrorCode.NOT_FOUND, `page introuvable : ${pageId}`, 404, { resource: 'page', id: pageId });
  }
  return path.join(pagesRoot, relpath);
}

function parseTextRef(value: unknown, parameter: string): { kind: string; id: string } {
  if (typeof value !== 'object' || value === null) {
    throw invalidParameter(parameter, JSON.stringify(value), `${parameter} doit être { kind, id }`);
  }
  const { kind, id } = value as Record<string, unknown>;
  if (typeof kind !== 'string' || typeof id !== 'string') {
    throw invalidParameter(parameter, JSON.stringify(value), `${parameter} doit être { kind, id }`);
  }
  return { kind, id };
}

function parseCorrectionInput(body: unknown): TextCorrectionInput {
  if (typeof body !== 'object' || body === null) {
    throw invalidParameter('body', JSON.stringify(body), 'corps de requête invalide');
  }
  const { ref, text } = body as Record<string, unknown>;
  if (typeof text !== 'string') throw invalidParameter('text', JSON.stringify(text), 'text doit être une chaîne');
  return { ref: parseTextRef(ref, 'ref'), text };
}

export function registerTextsRoutes(server: FastifyInstance, deps: TextsRoutesDeps): void {
  const { pool, pagesRoot, imageService } = deps;
  const pageThumbDeps: PageThumbDeps = {
    renderCacheRoot: imageService.renderCacheRoot, safeFs: imageService.safeFs, inFlight: imageService.inFlight,
  };

  server.get('/documents', async (): Promise<{ items: readonly TextDocument[] }> => {
    const client = await pool.connect();
    try {
      return { items: await listDocuments(client) };
    } finally {
      client.release();
    }
  });

  server.get('/pages', async (request): Promise<{ items: readonly TextPage[] }> => {
    const parsed = parseQueryParams(request.query as Record<string, unknown>, {
      documentId: { kind: 'open' },
      dateFrom: { kind: 'isoDate' },
      dateTo: { kind: 'isoDate' },
      q: { kind: 'open' },
    });
    const client = await pool.connect();
    try {
      return { items: await listPages(client, toPageFilters(parsed)) };
    } finally {
      client.release();
    }
  });

  server.get('/pages/image', async (request, reply) => {
    const parsed = parseQueryParams(request.query as Record<string, unknown>, {
      pageId: { kind: 'open' },
    });
    const pageId = parsed.pageId as string | undefined;
    if (pageId === undefined) {
      throw new AppError(ErrorCode.INVALID_PARAMETER, 'pageId est requis', 400,
        { parameter: 'pageId', received: '', accepted: null });
    }

    const sourcePath = await resolvePageSourcePath(pool, pagesRoot, pageId);
    if (!await pathExists(sourcePath)) {
      throw new AppError(ErrorCode.SOURCE_FILE_MISSING, `image de page manquante`, 404,
        { cloudAssetId: pageId, expectedPath: sourcePath });
    }
    void reply.type('image/jpeg');
    return await readFile(sourcePath);
  });

  server.get('/pages/thumb', async (request, reply) => {
    const parsed = parseQueryParams(request.query as Record<string, unknown>, {
      pageId: { kind: 'open' },
      edge: { kind: 'closed', values: PAGE_THUMB_EDGE_VALUES, fallback: PAGE_THUMB_EDGE_VALUES[1] },
    });
    const pageId = parsed.pageId as string | undefined;
    if (pageId === undefined) {
      throw new AppError(ErrorCode.INVALID_PARAMETER, 'pageId est requis', 400,
        { parameter: 'pageId', received: '', accepted: null });
    }
    const edge = Number(parsed.edge);

    const sourcePath = await resolvePageSourcePath(pool, pagesRoot, pageId);
    const result = await getPageThumb(pageThumbDeps, pageId, sourcePath, edge);
    if (result.failure !== null) {
      throw new AppError(ErrorCode.SOURCE_FILE_MISSING, `image de page manquante`, 404,
        { cloudAssetId: pageId, expectedPath: sourcePath });
    }
    void reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    void reply.type('image/jpeg');
    return result.buffer;
  });

  server.get('/texts', async (request): Promise<ListEnvelope<TextUnit>> => {
    const parsed = parseQueryParams(request.query as Record<string, unknown>, TEXTS_PARAM_SPEC);
    const filters = toFilters(parsed);

    const client = await pool.connect();
    try {
      const result = await listTexts(client, filters);
      return {
        items: result.items, total: result.total,
        populationTotal: result.total + result.undatedExcluded, excludedCount: result.undatedExcluded,
        filters: { applied: parsed.applied, unmatchedValues: [] },
        importId: '',
      };
    } finally {
      client.release();
    }
  });

  server.get('/texts/facets', async (request): Promise<TextDateFacets> => {
    const parsed = parseQueryParams(request.query as Record<string, unknown>, {
      documentId: { kind: 'open' },
    });
    const documentId = parsed.documentId as string | undefined;

    const client = await pool.connect();
    try {
      return await getTextDateFacets(client, documentId);
    } finally {
      client.release();
    }
  });

  server.put('/corrections', async (request): Promise<TextUnit> => {
    const input = parseCorrectionInput(request.body);
    // Effacer un texte n'est pas le corriger (contrat §4.4).
    if (input.text.trim() === '') {
      throw new AppError(ErrorCode.EMPTY_CORRECTION, 'une correction vide ou blanche est refusée', 422,
        { targetId: input.ref.id });
    }

    const unit = await withTransaction(pool, (client) => putCorrection(client, input));
    if (unit === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `texte introuvable : ${input.ref.kind}/${input.ref.id}`, 404,
        { resource: 'text', id: input.ref.id });
    }
    return unit;
  });

  server.post('/corrections/revert', async (request): Promise<TextUnit> => {
    if (typeof request.body !== 'object' || request.body === null) {
      throw invalidParameter('body', JSON.stringify(request.body), 'corps de requête invalide');
    }
    const { ref } = request.body as Record<string, unknown>;
    const parsedRef = parseTextRef(ref, 'ref');

    const unit = await withTransaction(pool, (client) => revertCorrection(client, parsedRef));
    if (unit === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `texte introuvable : ${parsedRef.kind}/${parsedRef.id}`, 404,
        { resource: 'text', id: parsedRef.id });
    }
    return unit;
  });

  server.get('/corrections', async (request): Promise<{ items: readonly TextCorrection[] }> => {
    const parsed = parseQueryParams(request.query as Record<string, unknown>, {
      status: { kind: 'closed', values: [CorrectionStatus.APPLIED, CorrectionStatus.NEEDS_REVIEW, CorrectionStatus.ORPHANED] },
    });
    const status = parsed.status as 'applied' | 'needs_review' | 'orphaned' | undefined;

    const client = await pool.connect();
    try {
      return { items: await listCorrections(client, status) };
    } finally {
      client.release();
    }
  });
}
