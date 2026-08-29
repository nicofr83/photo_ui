import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';

import { ErrorCode, TextKind, TranscriptionConfidence } from '@shared/enums';
import { AppError } from '../contract/error_interface.ts';
import type { ListEnvelope } from '../contract/filter_interface.ts';
import type { TextDocument, TextPage, TextUnit } from '../contract/text_interface.ts';
import type { Pool } from '../db/pool.ts';
import {
  getPageImageRelpath, listDocuments, listPages, listTexts, type TextFilters,
} from '../repository/text_repository.ts';
import { parseQueryParams, type ParamSpec } from './query_params.ts';

export interface TextsRoutesDeps {
  readonly pool: Pool;
  readonly pagesRoot: string;
}

const TEXTS_PARAM_SPEC: ParamSpec = {
  documentId: { kind: 'open' },
  pageId: { kind: 'open' },
  kind: { kind: 'closed', values: [TextKind.PASSAGE, TextKind.LOG_ENTRY] },
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

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export function registerTextsRoutes(server: FastifyInstance, deps: TextsRoutesDeps): void {
  const { pool, pagesRoot } = deps;

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
    });
    const documentId = parsed.documentId as string | undefined;
    const client = await pool.connect();
    try {
      return { items: await listPages(client, documentId) };
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

    const sourcePath = path.join(pagesRoot, relpath);
    if (!await pathExists(sourcePath)) {
      throw new AppError(ErrorCode.SOURCE_FILE_MISSING, `image de page manquante`, 404,
        { cloudAssetId: pageId, expectedPath: sourcePath });
    }
    void reply.type('image/jpeg');
    return await readFile(sourcePath);
  });

  server.get('/texts', async (request): Promise<ListEnvelope<TextUnit>> => {
    const parsed = parseQueryParams(request.query as Record<string, unknown>, TEXTS_PARAM_SPEC);
    const filters = toFilters(parsed);

    const client = await pool.connect();
    try {
      const result = await listTexts(client, filters);
      return {
        items: result.items, total: result.total, populationTotal: result.total, excludedCount: 0,
        filters: { applied: parsed.applied, unmatchedValues: [] },
        importId: '',
      };
    } finally {
      client.release();
    }
  });
}
