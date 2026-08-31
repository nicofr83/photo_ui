import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';

import { CorrectionStatus, ErrorCode, TextKind, TranscriptionConfidence } from '@shared/enums';
import { AppError } from '../contract/error_interface.ts';
import type { ListEnvelope } from '../contract/filter_interface.ts';
import type {
  TextCorrection, TextDateFacets, TextDocument, TextPage, TextUnit, WebSitePage,
} from '../contract/text_interface.ts';
import type { Pool } from '../db/pool.ts';
import { withTransaction } from '../db/transaction.ts';
import type { ImageServiceDeps } from '../metier/images/image_service.ts';
import { getPageThumb, type PageThumbDeps } from '../metier/pages/thumb_service.ts';
import {
  isAllowedAssetExtension, isValidPageId, labelFromPageId, resolveUnderRoot,
} from '../metier/web_site/web_site_path.ts';
import { extractTitle, rewriteAssetUrls, rewriteCssUrls, stripScripts } from '../metier/web_site/web_site_html.ts';
import { getTextDateFacets } from '../repository/text_facets.ts';
import {
  getPageImageRelpath, listCorrections, listDocuments, listPages, listTexts, putCorrection, revertCorrection,
  type PageFilters, type TextCorrectionInput, type TextFilters,
} from '../repository/text_repository.ts';
import { isRealCalendarDay, parseQueryParams, type ParamSpec } from './query_params.ts';

/** Vocabulaire FERMÉ (contrat §6.1) — une valeur libre laisserait un visiteur remplir le disque de variantes. */
const PAGE_THUMB_EDGE_VALUES = ['160', '320', '640'] as const;

/** Le motif des 5 pages, réutilisé pour la LISTE (`readdir` + filtre) — jamais les 5 noms codés en dur, jamais une deuxième version du motif (`web_site_path.ts` en porte la validation). */
const WEB_PAGE_FILENAME = /^\d{4}-\d{4}\.html?$/;

const ASSET_ROUTE_BASE = '/texts/web/asset?path=';

export interface TextsRoutesDeps {
  readonly pool: Pool;
  readonly pagesRoot: string;
  /** Canonicalisée UNE FOIS au démarrage (`bootstrap.ts`) — la base de toute résolution `resolveUnderRoot` (V1.7, sécurité). */
  readonly webSiteRoot: string;
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

/**
 * `date` omis (`undefined`) : ne touche pas une correction de date existante.
 * `date: null` : l'efface. `{start, end}` : la pose — `start` doit égaler
 * `end` (D11, un texte affirme un jour ou rien) et les deux doivent être de
 * vrais jours civils, jamais seulement le bon format (V1.6).
 */
function parseCorrectionDate(value: unknown): { readonly start: string; readonly end: string } | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'object') {
    throw invalidParameter('date', JSON.stringify(value), 'date doit être { start, end } ou null');
  }
  const { start, end } = value as Record<string, unknown>;
  if (typeof start !== 'string' || typeof end !== 'string') {
    throw invalidParameter('date', JSON.stringify(value), 'date.start et date.end doivent être des chaînes');
  }
  if (!isRealCalendarDay(start)) throw invalidParameter('date.start', start, 'date.start doit être un jour civil réel');
  if (!isRealCalendarDay(end)) throw invalidParameter('date.end', end, 'date.end doit être un jour civil réel');
  if (start !== end) {
    throw invalidParameter('date.end', end, 'date.start doit égaler date.end — un texte affirme un jour ou rien (D11)');
  }
  return { start, end };
}

function parseCorrectionInput(body: unknown): TextCorrectionInput {
  if (typeof body !== 'object' || body === null) {
    throw invalidParameter('body', JSON.stringify(body), 'corps de requête invalide');
  }
  const { ref, text, date } = body as Record<string, unknown>;
  if (typeof text !== 'string') throw invalidParameter('text', JSON.stringify(text), 'text doit être une chaîne');
  const parsedDate = parseCorrectionDate(date);
  return parsedDate === undefined
    ? { ref: parseTextRef(ref, 'ref'), text }
    : { ref: parseTextRef(ref, 'ref'), text, date: parsedDate };
}

export function registerTextsRoutes(server: FastifyInstance, deps: TextsRoutesDeps): void {
  const { pool, pagesRoot, webSiteRoot, imageService } = deps;
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

  // --- Les 5 pages du site, lues en place (V1.7). Document d'archive : le
  // texte reste au mot près, seuls l'encodage, les scripts et les URL
  // d'actifs sont touchés.

  server.get('/texts/web/pages', async (): Promise<{ items: readonly WebSitePage[] }> => {
    const entries = await readdir(webSiteRoot);
    const ids = entries.filter((name) => WEB_PAGE_FILENAME.test(name)).sort();
    const items = await Promise.all(ids.map(async (id): Promise<WebSitePage> => {
      const raw = await readFile(path.join(webSiteRoot, id));
      const html = new TextDecoder('windows-1252').decode(raw);
      const label = labelFromPageId(id) ?? id;
      return { id, title: extractTitle(html) ?? label, label };
    }));
    return { items };
  });

  server.get('/texts/web/page', async (request, reply) => {
    const parsed = parseQueryParams(request.query as Record<string, unknown>, {
      id: { kind: 'open' },
    });
    const id = parsed.id as string | undefined;
    // Motif de nom STRICT avant tout accès disque (V1.7, sécurité) — un
    // `id` mal formé est refusé sans jamais toucher au système de fichiers.
    if (id === undefined || !isValidPageId(id)) {
      throw invalidParameter('id', JSON.stringify(id), 'id doit être une des pages du site (AAAA-AAAA.htm)');
    }

    const resolved = await resolveUnderRoot(webSiteRoot, id);
    if (resolved === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `page du site introuvable : ${id}`, 404, { resource: 'web_page', id });
    }

    const raw = await readFile(resolved);
    const html = new TextDecoder('windows-1252').decode(raw);
    // Retirés à la source (team-lead) puis les URL d'actifs réécrites —
    // rien d'autre : document d'archive, le texte reste au mot près.
    const rendered = rewriteAssetUrls(stripScripts(html), ASSET_ROUTE_BASE);

    void reply.header('Content-Type', 'text/html; charset=utf-8');
    return rendered;
  });

  server.get('/texts/web/asset', async (request, reply) => {
    const parsed = parseQueryParams(request.query as Record<string, unknown>, {
      path: { kind: 'open' },
    });
    const rawPath = parsed.path as string | undefined;
    // Liste blanche d'EXTENSIONS avant tout accès disque (V1.7, sécurité) —
    // exactement ce que les pages référencent, jamais plus.
    if (rawPath === undefined || !isAllowedAssetExtension(rawPath)) {
      throw invalidParameter('path', JSON.stringify(rawPath), 'path doit désigner un actif css/gif/jpg/png');
    }

    // Le point qui compte le plus (team-lead) : résolu puis vérifié par
    // `realpath` sous la racine — un `..` normalisé ou un lien symbolique
    // qui en ressortirait est refusé ici, jamais seulement par le motif.
    const resolved = await resolveUnderRoot(webSiteRoot, rawPath);
    if (resolved === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `actif du site introuvable : ${rawPath}`, 404,
        { resource: 'web_asset', id: rawPath });
    }

    void reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    const extension = path.extname(rawPath).toLowerCase();
    if (extension === '.css') {
      // Une feuille de thème référence ses PROPRES images par un `url(…)`
      // relatif à SON dossier, jamais à celui de la page qui la charge.
      const raw = await readFile(resolved);
      const css = new TextDecoder('windows-1252').decode(raw);
      const cssRelativeDir = path.posix.dirname(rawPath);
      void reply.header('Content-Type', 'text/css; charset=utf-8');
      return rewriteCssUrls(css, cssRelativeDir, ASSET_ROUTE_BASE);
    }

    const contentType = extension === '.gif' ? 'image/gif' : extension === '.jpg' ? 'image/jpeg' : 'image/png';
    void reply.type(contentType);
    return await readFile(resolved);
  });
}
