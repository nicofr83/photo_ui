import type { FastifyInstance } from 'fastify';

import { ErrorCode } from '@shared/enums';
import { AppError } from '../contract/error_interface.ts';
import type { Album, AlbumSpanUpdateResult } from '../contract/photo_interface.ts';
import type { TextDocument, WebDocumentRow } from '../contract/text_interface.ts';
import type { Pool } from '../db/pool.ts';
import { withTransaction } from '../db/transaction.ts';
import { isInWebPerimeter } from '../metier/dating/web_perimeter.ts';
import {
  deleteAlbumSpan, listAlbums, putAlbumSpan, type AlbumSpanInput,
} from '../repository/album_repository.ts';
import { deleteWebSpan, listWebDocuments, putWebSpan, type WebSpanInput } from '../repository/text_repository.ts';
import { parseQueryParams } from './query_params.ts';

export interface RefRoutesDeps {
  readonly pool: Pool;
  readonly annotationsDir: string;
  readonly periodFrom: string;
  readonly periodTo: string;
}

const WEB_DOCUMENTS_SCOPE_VALUES = ['perimeter', 'all'] as const;

function invalidParameter(parameter: string, received: string, message: string): AppError {
  return new AppError(ErrorCode.INVALID_PARAMETER, message, 400, { parameter, received, accepted: null });
}

function assertOrderedDates(dateFrom: string, dateTo: string): void {
  if (dateFrom > dateTo) {
    throw invalidParameter('dateTo', dateTo, 'dateTo doit être >= dateFrom');
  }
}

function parseAlbumSpanInput(body: unknown): AlbumSpanInput {
  if (typeof body !== 'object' || body === null) {
    throw invalidParameter('body', JSON.stringify(body), 'corps de requête invalide');
  }
  const { albumPath, dateFrom, dateTo, note } = body as Record<string, unknown>;
  if (typeof albumPath !== 'string') throw invalidParameter('albumPath', JSON.stringify(albumPath), 'albumPath doit être une chaîne');
  if (typeof dateFrom !== 'string') throw invalidParameter('dateFrom', JSON.stringify(dateFrom), 'dateFrom doit être une chaîne');
  if (typeof dateTo !== 'string') throw invalidParameter('dateTo', JSON.stringify(dateTo), 'dateTo doit être une chaîne');
  if (note !== null && typeof note !== 'string') throw invalidParameter('note', JSON.stringify(note), 'note doit être une chaîne ou null');
  return { albumPath, dateFrom, dateTo, note: note ?? null };
}

function parseAlbumPath(body: unknown): string {
  if (typeof body !== 'object' || body === null) {
    throw invalidParameter('body', JSON.stringify(body), 'corps de requête invalide');
  }
  const { albumPath } = body as Record<string, unknown>;
  if (typeof albumPath !== 'string') throw invalidParameter('albumPath', JSON.stringify(albumPath), 'albumPath doit être une chaîne');
  return albumPath;
}

/** Une seule borne (amendement A9) — `dateTo` n'existe plus en entrée, la fin se calcule à la lecture. */
function parseWebSpanInput(body: unknown): WebSpanInput {
  if (typeof body !== 'object' || body === null) {
    throw invalidParameter('body', JSON.stringify(body), 'corps de requête invalide');
  }
  const { documentId, dateFrom, note } = body as Record<string, unknown>;
  if (typeof documentId !== 'string') throw invalidParameter('documentId', JSON.stringify(documentId), 'documentId doit être une chaîne');
  if (typeof dateFrom !== 'string') throw invalidParameter('dateFrom', JSON.stringify(dateFrom), 'dateFrom doit être une chaîne');
  if (note !== null && typeof note !== 'string') throw invalidParameter('note', JSON.stringify(note), 'note doit être une chaîne ou null');
  return { documentId, dateFrom, note: note ?? null };
}

function parseDocumentId(body: unknown): string {
  if (typeof body !== 'object' || body === null) {
    throw invalidParameter('body', JSON.stringify(body), 'corps de requête invalide');
  }
  const { documentId } = body as Record<string, unknown>;
  if (typeof documentId !== 'string') throw invalidParameter('documentId', JSON.stringify(documentId), 'documentId doit être une chaîne');
  return documentId;
}

/**
 * Référentiels — écran « Réglages » (contrat §4.8). `GET /ref/countries` et
 * `PUT /ref/country-aliases` restent hors mandat (pas dans le périmètre reçu
 * pour la tâche 25).
 */
export function registerRefRoutes(server: FastifyInstance, deps: RefRoutesDeps): void {
  const { pool, annotationsDir, periodFrom, periodTo } = deps;
  const periodFromYear = Number(periodFrom.slice(0, 4));
  const periodToYear = Number(periodTo.slice(0, 4));

  server.get('/albums', async (): Promise<{ items: readonly Album[] }> => {
    const client = await pool.connect();
    try {
      return { items: await listAlbums(client) };
    } finally {
      client.release();
    }
  });

  server.put('/ref/album-span', async (request): Promise<AlbumSpanUpdateResult> => {
    const input = parseAlbumSpanInput(request.body);
    assertOrderedDates(input.dateFrom, input.dateTo);

    const result = await withTransaction(pool, (client) => putAlbumSpan(client, annotationsDir, input));
    if (result === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `album introuvable : ${input.albumPath}`, 404,
        { resource: 'album', id: input.albumPath });
    }
    return result;
  });

  server.delete('/ref/album-span', async (request): Promise<AlbumSpanUpdateResult> => {
    const albumPath = parseAlbumPath(request.body);

    const result = await withTransaction(pool, (client) => deleteAlbumSpan(client, annotationsDir, albumPath));
    if (result === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `album introuvable : ${albumPath}`, 404,
        { resource: 'album', id: albumPath });
    }
    return result;
  });

  server.get('/ref/web-documents', async (request): Promise<{ items: readonly WebDocumentRow[] }> => {
    const parsed = parseQueryParams(request.query as Record<string, unknown>, {
      scope: { kind: 'closed', values: WEB_DOCUMENTS_SCOPE_VALUES, fallback: 'perimeter' },
    });
    const scope = parsed.scope as typeof WEB_DOCUMENTS_SCOPE_VALUES[number];

    const client = await pool.connect();
    try {
      const documents = await listWebDocuments(client);
      const items = scope === 'all' ? documents : documents.filter((doc) => isInWebPerimeter(
        { documentId: doc.documentId, passageCount: doc.passageCount, proposalDate: doc.proposal?.date ?? null },
        periodFromYear, periodToYear,
      ));
      return { items };
    } finally {
      client.release();
    }
  });

  server.put('/ref/web-span', async (request): Promise<TextDocument> => {
    const input = parseWebSpanInput(request.body);

    const document = await withTransaction(pool, (client) => putWebSpan(client, input));
    if (document === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `document web introuvable : ${input.documentId}`, 404,
        { resource: 'document', id: input.documentId });
    }
    return document;
  });

  server.delete('/ref/web-span', async (request): Promise<TextDocument> => {
    const documentId = parseDocumentId(request.body);

    const document = await withTransaction(pool, (client) => deleteWebSpan(client, documentId));
    if (document === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `document web introuvable : ${documentId}`, 404,
        { resource: 'document', id: documentId });
    }
    return document;
  });
}
