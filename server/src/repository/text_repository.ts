import { OverlapRule, TextKind, TranscriptionConfidence, type DateSource } from '@shared/enums';
import type { PoolClient } from '../db/pool.ts';
import type {
  LogEntryFields, OverlapInfo, OverlapSummary, TextCorrection, TextDocument, TextPage, TextUnit, TextWithOverlap,
  WebDocumentRow,
} from '../contract/text_interface.ts';
import { computeOverlapInfo, spanDays } from '../metier/overlap/overlap_info.ts';
import {
  EFFECTIVE_COVERS_END, EFFECTIVE_COVERS_RANGE, EFFECTIVE_COVERS_RULE, EFFECTIVE_COVERS_START, overlapPredicate,
  WEB_SPAN_JOIN,
} from '../metier/overlap/overlap_sql.ts';
import { cleanSearchQuery } from '../metier/search/clean_query.ts';
import { highlight } from '../metier/search/highlight.ts';

interface DocumentRow {
  id: string;
  kind: string;
  title: string;
  page_count: number | null;
  has_pages: boolean;
  passage_count: number;
  date_from: string | null;
  date_to: string | null;
}

function mapDocumentRow(row: DocumentRow): TextDocument {
  return {
    id: row.id,
    kind: row.kind as TextDocument['kind'],
    title: row.title,
    pageCount: row.page_count,
    passageCount: row.passage_count,
    hasPages: row.has_pages,
    // `ref.web_span` — une plage saisie, jamais une mesure : COMBLE un vide,
    // n'arbitre rien (§8.1, la même règle que rang 0 de la cascade photo).
    span: row.date_from === null || row.date_to === null ? null : {
      start: row.date_from, end: row.date_to, precision: 'day', kind: 'inference', source: 'web_span',
      bracketHours: null,
    },
  };
}

/**
 * La chaîne des documents web DATÉS, par DATE — jamais par `document_id`
 * (un chemin de fichier mesuré non chronologique : `gal_7` du 9 octobre est
 * rangé avant `gal_5` du 13) ni par ordre d'insertion. Amendement A9 : une
 * seule borne saisie, la fin de chacun est la veille du début du suivant
 * (Nicolas, via team-lead — « la date de début du suivant est la date de
 * fin »), et le dernier n'a pas de suivant : sa propre fin est son propre
 * début. AUCUN héritage vers un document non daté — `LEFT JOIN` seul,
 * jamais de repli sur un voisin : un rebut ou un gabarit vide sans date
 * saisie reste `span: null`, il « sort de lui-même » plutôt que de recevoir
 * une période inventée.
 */
const WEB_SPAN_CHAIN = `
  web_span_chain AS (
    SELECT document_id, date_from,
           coalesce(LEAD(date_from) OVER (ORDER BY date_from) - 1, date_from) AS date_to
      FROM ref.web_span
  )`;

const DOCUMENT_SELECT = `
    WITH ${WEB_SPAN_CHAIN}
    SELECT d.id, d.kind, d.title, d.page_count, d.has_pages,
           (SELECT count(*)::int FROM pipeline.text_unit t
             WHERE t.document_id = d.id AND t.kind = 'passage') AS passage_count,
           wsc.date_from, wsc.date_to
      FROM pipeline.document d
      LEFT JOIN web_span_chain wsc ON wsc.document_id = d.id`;

/** 62 documents (contrat §4.3) — assez petit pour un aller-retour sans filtre. */
export async function listDocuments(client: PoolClient): Promise<readonly TextDocument[]> {
  const { rows } = await client.query<DocumentRow>(`${DOCUMENT_SELECT} ORDER BY d.id`);
  return rows.map(mapDocumentRow);
}

export async function getTextDocument(client: PoolClient, documentId: string): Promise<TextDocument | null> {
  const { rows } = await client.query<DocumentRow>(`${DOCUMENT_SELECT} WHERE d.id = $1`, [documentId]);
  const row = rows[0];
  return row === undefined ? null : mapDocumentRow(row);
}

interface PageRow {
  id: string;
  document_id: string;
  ordinal: number;
  label: string | null;
  width: number;
  height: number;
  window_start: string | null;
  window_end: string | null;
  span_source: string | null;
  page_date_start: string | null;
  page_date_end: string | null;
  page_date_source: string | null;
}

const PAGE_SELECT = `
    SELECT p.id, p.document_id, p.ordinal, p.label, p.width, p.height,
           p.window_start, p.window_end, p.span_source,
           d.date_start AS page_date_start, d.date_end AS page_date_end, d.source AS page_date_source
      FROM pipeline.page p
      LEFT JOIN app.page_date d ON d.page_id = p.id`;

function mapPageRow(row: PageRow): TextPage {
  return {
    id: row.id,
    documentId: row.document_id,
    ordinal: row.ordinal,
    label: row.label,
    width: row.width,
    height: row.height,
    // Toujours une INFÉRENCE, `carried` y compris — une fenêtre de page est
    // CALCULÉE depuis ses propres textes, jamais affirmée par la page elle-même.
    window: row.window_start === null || row.window_end === null ? null : {
      start: row.window_start, end: row.window_end, precision: 'day', kind: 'inference', source: 'page_window',
      bracketHours: null,
    },
    spanSource: row.span_source as TextPage['spanSource'],
    // La date de LA PAGE (cascade registre → notes → héritage, v1.5) —
    // `reading` quand elle l'affirme (registre ou notes), `inference` quand
    // elle est héritée (`carried`). Jamais confondue avec `window` ci-dessus.
    date: row.page_date_start === null || row.page_date_end === null ? null : {
      start: row.page_date_start, end: row.page_date_end, precision: 'day',
      kind: row.page_date_source === 'carried' ? 'inference' : 'reading',
      source: 'page_date', bracketHours: null,
    },
    imageUrl: `/pages/image?pageId=${encodeURIComponent(row.id)}`,
    // `pages.region` est NULL sur les 155 lignes (contrat) — jamais promis.
    regionsAvailable: false,
  };
}

export async function listPages(client: PoolClient, documentId?: string): Promise<readonly TextPage[]> {
  const { rows } = documentId === undefined
    ? await client.query<PageRow>(`${PAGE_SELECT} ORDER BY p.document_id, p.ordinal`)
    : await client.query<PageRow>(`${PAGE_SELECT} WHERE p.document_id = $1 ORDER BY p.ordinal`, [documentId]);
  return rows.map(mapPageRow);
}

export async function getPageImageRelpath(client: PoolClient, pageId: string): Promise<string | null> {
  const { rows } = await client.query<{ image_relpath: string }>(
    `SELECT image_relpath FROM pipeline.page WHERE id = $1`, [pageId]);
  return rows[0]?.image_relpath ?? null;
}

export interface TextFilters {
  readonly documentId?: string;
  readonly pageId?: string;
  readonly kind?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly overlapsPhoto?: string;
  readonly confidence?: string;
  readonly hasCorrection?: boolean;
  readonly q?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly sort?: 'page' | 'date' | 'relevance';
}

export interface ListTextsResult {
  readonly items: readonly TextUnit[];
  readonly total: number;
}

interface TextRow {
  kind: string;
  id: string;
  document_id: string;
  page_id: string | null;
  ordinal: number;
  body: string;
  corrected_text: string | null;
  original_at_correction: string | null;
  corrected_at: string | null;
  confidence: string;
  date_source: string | null;
  date_start: string | null;
  date_end: string | null;
  date_kind: string | null;
  page_span_source: string | null;
  overlapping_photo_count: number;
  entry_time: string | null;
  entry_lat: number | null;
  entry_lon: number | null;
  raw_position: string | null;
  place_name: string | null;
  heading: string | null;
  wind: string | null;
  baro: number | null;
  engine_hours: number | null;
  fix_confidence: string | null;
  remark_confidence: string | null;
}

function mapTextRow(row: TextRow): TextUnit {
  const correction: TextCorrection | null = row.original_at_correction === null || row.corrected_at === null
    ? null
    : {
        ref: { kind: row.kind, id: row.id },
        text: row.corrected_text ?? row.body,
        originalAtCorrection: row.original_at_correction,
        correctedAt: row.corrected_at,
        // Le statut de dérive (needs_review/orphaned) se calcule contre le texte
        // AMONT actuel — tâche 24. Ici : présente, donc appliquée par défaut.
        status: row.original_at_correction === row.body ? 'applied' : 'needs_review',
      };

  const logEntry: LogEntryFields | null = row.kind !== 'log_entry' ? null : {
    time: row.entry_time,
    lat: row.entry_lat, lon: row.entry_lon,
    rawPosition: row.raw_position, placeName: row.place_name,
    heading: row.heading, wind: row.wind, baro: row.baro, engineHours: row.engine_hours,
    fixConfidence: (row.fix_confidence ?? row.confidence) as LogEntryFields['fixConfidence'],
    remarkConfidence: (row.remark_confidence ?? row.confidence) as LogEntryFields['remarkConfidence'],
  };

  return {
    ref: { kind: row.kind, id: row.id },
    documentId: row.document_id,
    pageId: row.page_id,
    ordinal: row.ordinal,
    text: row.corrected_text ?? row.body,
    textOriginal: row.body,
    correction,
    confidence: row.confidence as TextUnit['confidence'],
    date: row.date_source === null || row.date_start === null || row.date_end === null ? null : {
      start: row.date_start, end: row.date_end, precision: 'day', kind: 'reading',
      source: row.date_source as DateSource, bracketHours: null,
    },
    pageSpanSource: row.page_span_source as TextUnit['pageSpanSource'],
    overlappingPhotoCount: row.overlapping_photo_count,
    highlights: [],
    logEntry,
    // `TEXT_UNIT_SELECT` ne lit que `pipeline.text_unit` — jamais un `web_caption`
    // (appariement de galerie, `app.web_gallery_link`, servi ailleurs).
    galleryCaption: null,
  };
}

/**
 * Le même SELECT partout où une ligne `TextUnit` complète est nécessaire —
 * `listTexts` et le lookup unitaire des corrections — pour que les deux ne
 * divergent jamais sur ce qu'un `TextUnit` porte.
 */
const TEXT_UNIT_SELECT = `
    SELECT t.kind, t.id, t.document_id, t.page_id, t.ordinal, t.body,
           tc.corrected_text, tc.original_at_correction, tc.corrected_at,
           t.confidence, t.date_source, t.date_start, t.date_end, t.date_kind, t.page_span_source,
           (SELECT count(*)::int FROM pipeline.photo p
             WHERE ${overlapPredicate('p')}) AS overlapping_photo_count,
           t.entry_time, ST_Y(t.entry_position::geometry) AS entry_lat, ST_X(t.entry_position::geometry) AS entry_lon,
           t.raw_position, t.place_name, t.heading, t.wind, t.baro, t.engine_hours,
           t.fix_confidence, t.remark_confidence
      FROM pipeline.text_unit t
      JOIN pipeline.document d ON d.id = t.document_id
      LEFT JOIN app.text_correction tc ON tc.text_kind = t.kind AND tc.text_id = t.id
      LEFT JOIN app.text_search ts ON ts.kind = t.kind AND ts.id = t.id
      ${WEB_SPAN_JOIN}`;

async function getTextUnit(client: PoolClient, ref: { readonly kind: string; readonly id: string }): Promise<TextUnit | null> {
  const { rows } = await client.query<TextRow>(
    `${TEXT_UNIT_SELECT} WHERE t.kind = $1 AND t.id = $2`, [ref.kind, ref.id]);
  const row = rows[0];
  return row === undefined ? null : mapTextRow(row);
}

/**
 * Les textes sélectionnés d'une tâche, pour `GET /tasks/:slug/review`
 * (tâche 26) — même `TEXT_UNIT_SELECT` que partout ailleurs, jointe sur
 * `app.task_text`. Une sélection orpheline (`text_id` disparu de `pipeline`)
 * ne peut produire aucun `TextUnit` : la jointure l'exclut naturellement,
 * elle compte dans `warnings.orphanedTexts`, jamais ici.
 */
export async function listTaskTexts(client: PoolClient, slug: string): Promise<readonly TextUnit[]> {
  const { rows } = await client.query<TextRow>(
    `${TEXT_UNIT_SELECT}
     JOIN app.task_text tt ON tt.text_kind = t.kind AND tt.text_id = t.id
     WHERE tt.task_slug = $1
     ORDER BY tt.position`, [slug]);
  return rows.map(mapTextRow);
}

interface GalleryLinkRow {
  sha256: string;
  page: string;
  image_path: string;
  caption: string | null;
  alt: string | null;
  distance: number;
  margin: number;
  verified: boolean | null;
  ordinal: number;
  overlapping_photo_count: number;
}

/** `2003/2003_gal_11.htm` → `2003/2003_gal_11` — matches 26 of 27 real `pipeline.document` ids (kind html), one page (`Astro/misc/…`) never imported. */
function stripHtmlExtension(page: string): string {
  return page.replace(/\.html?$/i, '');
}

function mapGalleryLinkRow(row: GalleryLinkRow): TextUnit {
  const text = row.caption ?? row.alt ?? '';
  const verified = row.verified === true;
  return {
    ref: { kind: TextKind.WEB_CAPTION, id: `${row.sha256}:${row.image_path}` },
    // Aucun `pipeline.page` derrière une légende de galerie — les pages scannées
    // sont pour le journal manuscrit, pas pour le site web.
    documentId: `web/${stripHtmlExtension(row.page)}`,
    pageId: null,
    ordinal: row.ordinal,
    text, textOriginal: text,
    // Pas de correction pour ce registre — `app.text_correction` cible
    // `pipeline.text_unit` uniquement ; `verified` porte déjà le geste humain
    // qui compte ici (confirmer l'appariement, pas réécrire le texte).
    correction: null,
    // `verified` REVIEWED, sinon UNCERTAIN — jamais TRANSCRIBED, qui suppose
    // une lecture humaine du texte lui-même, pas une confirmation d'appariement.
    confidence: verified ? TranscriptionConfidence.REVIEWED : TranscriptionConfidence.UNCERTAIN,
    // Un texte affirme un jour ou rien (D11) — une légende de galerie n'affirme
    // jamais de date, la sienne vient de la photo qu'elle légende, par lien
    // DIRECT (règle GALLERY_MATCH), jamais par recouvrement de plage.
    date: null,
    pageSpanSource: null,
    overlappingPhotoCount: row.overlapping_photo_count,
    highlights: [],
    logEntry: null,
    galleryCaption: {
      sha256: row.sha256, page: row.page, imagePath: row.image_path,
      distance: row.distance, margin: row.margin, verified,
    },
  };
}

/**
 * `GET /texts?kind=web_caption` — les légendes du site 2003-2004 appariées à
 * leur photo par hash perceptuel (contrat §11 Q11, `app.web_gallery_link`,
 * jamais `pipeline.text_unit` : une table entièrement différente, une
 * requête entièrement séparée). Exclu : un lien sans AUCUN texte (ni
 * `caption` ni `alt` — rien à lire), et un lien qu'un humain a explicitement
 * rejeté (`verified = false` — jamais montré comme une légende, même
 * ambrée). `verified IS NULL` (« pas encore relu ») reste montré, non vérifié.
 *
 * Portée DÉLIBÉRÉMENT réduite pour cette passe : `limit`/`offset` seuls parmi
 * les filtres de `/texts` — `q`, `dateFrom`/`dateTo`, `confidence`,
 * `hasCorrection`, `overlapsPhoto`, `documentId`, `pageId` ne s'appliquent
 * pas encore à ce registre. Étendre `app.text_search` ou le prédicat de
 * recouvrement à ces 205 lignes est un travail séparé, pas fait ici.
 */
async function listWebCaptionTexts(client: PoolClient, filters: TextFilters): Promise<ListTextsResult> {
  const { rows: totalRows } = await client.query<{ n: number }>(`
    SELECT count(*)::int AS n FROM app.web_gallery_link wgl
     WHERE (wgl.caption IS NOT NULL OR wgl.alt IS NOT NULL) AND (wgl.verified IS NULL OR wgl.verified = true)`);
  const total = totalRows[0]?.n ?? 0;

  const values: unknown[] = [];
  const param = (value: unknown): string => {
    values.push(value);
    return `$${String(values.length)}`;
  };
  const limitClause = filters.limit !== undefined ? ` LIMIT ${param(filters.limit)}` : '';
  const offsetClause = filters.offset !== undefined ? ` OFFSET ${param(filters.offset)}` : '';

  const { rows } = await client.query<GalleryLinkRow>(`
    SELECT wgl.sha256, wgl.page, wgl.image_path, wgl.caption, wgl.alt, wgl.distance, wgl.margin, wgl.verified,
           (row_number() OVER (ORDER BY wgl.page, wgl.image_path))::int AS ordinal,
           (SELECT count(*)::int FROM pipeline.photo p WHERE p.sha256 = wgl.sha256) AS overlapping_photo_count
      FROM app.web_gallery_link wgl
     WHERE (wgl.caption IS NOT NULL OR wgl.alt IS NOT NULL) AND (wgl.verified IS NULL OR wgl.verified = true)
     ORDER BY wgl.page, wgl.image_path
     ${limitClause}${offsetClause}`, values);

  return { items: rows.map(mapGalleryLinkRow), total };
}

export async function listTexts(client: PoolClient, filters: TextFilters): Promise<ListTextsResult> {
  if (filters.kind === TextKind.WEB_CAPTION) return await listWebCaptionTexts(client, filters);

  const conditions: string[] = [];
  const values: unknown[] = [];
  const param = (value: unknown): string => {
    values.push(value);
    return `$${String(values.length)}`;
  };

  if (filters.documentId !== undefined) conditions.push(`t.document_id = ${param(filters.documentId)}`);
  if (filters.pageId !== undefined) conditions.push(`t.page_id = ${param(filters.pageId)}`);
  if (filters.kind !== undefined) conditions.push(`t.kind = ${param(filters.kind)}`);
  if (filters.confidence !== undefined) conditions.push(`t.confidence = ${param(filters.confidence)}`);
  if (filters.dateFrom !== undefined && filters.dateTo !== undefined) {
    conditions.push(`t.date_start IS NOT NULL `
      + `AND daterange(t.date_start, t.date_end, '[]') && daterange(${param(filters.dateFrom)}, ${param(filters.dateTo)}, '[]')`);
  }
  if (filters.hasCorrection !== undefined) {
    const exists = `EXISTS (SELECT 1 FROM app.text_correction c WHERE c.text_kind = t.kind AND c.text_id = t.id)`;
    conditions.push(filters.hasCorrection ? exists : `NOT ${exists}`);
  }
  if (filters.overlapsPhoto !== undefined) {
    conditions.push(`EXISTS (SELECT 1 FROM pipeline.photo p WHERE p.cloud_asset_id = ${param(filters.overlapsPhoto)} `
      + `AND ${overlapPredicate('p')})`);
  }

  // `app.text_search` porte le texte EFFECTIF (corrigé s'il l'a été) — la
  // même vue que la recherche doit refléter (tâche 24 la rafraîchit à
  // l'écriture d'une correction). Repli à ZÉRO sur du bruit pur, jamais
  // toute la bibliothèque — même règle que `GET /photos?q=`.
  let cleanedQuery: string | null = null;
  if (filters.q !== undefined && filters.q.trim() !== '') {
    cleanedQuery = cleanSearchQuery(filters.q);
    if (cleanedQuery === null) conditions.push('false');
    else conditions.push(`ts.tsv @@ plainto_tsquery('public.fr_unaccent', ${param(cleanedQuery)})`);
  }

  const whereClause = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`;
  const sortSql = filters.sort === 'date' ? 't.date_start ASC NULLS LAST, t.id'
    : filters.sort === 'relevance' && cleanedQuery !== null
      ? `ts_rank(ts.tsv, plainto_tsquery('public.fr_unaccent', ${param(cleanedQuery)})) DESC`
      : 'd.id, t.page_id, t.ordinal';

  const { rows: totalRows } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM pipeline.text_unit t
       JOIN pipeline.document d ON d.id = t.document_id
       LEFT JOIN app.text_search ts ON ts.kind = t.kind AND ts.id = t.id
       ${WEB_SPAN_JOIN}
      ${whereClause}`, values);
  const total = totalRows[0]?.n ?? 0;

  const limitClause = filters.limit !== undefined ? ` LIMIT ${param(filters.limit)}` : '';
  const offsetClause = filters.offset !== undefined ? ` OFFSET ${param(filters.offset)}` : '';

  const { rows } = await client.query<TextRow>(`
    ${TEXT_UNIT_SELECT}
     ${whereClause}
     ORDER BY ${sortSql}
     ${limitClause}${offsetClause}`, values);

  // `highlights` : « renseigné SEULEMENT par GET /texts?q=… » (contrat) —
  // vide sans recherche, jamais calculé pour rien.
  const terms = cleanedQuery === null ? [] : cleanedQuery.split(/\s+/).filter((t) => t !== '');
  return {
    items: rows.map((row) => {
      const unit = mapTextRow(row);
      return terms.length === 0 ? unit : { ...unit, highlights: highlight(unit.text, terms) };
    }),
    total,
  };
}

export interface OverlappingTextsResult {
  readonly items: readonly TextWithOverlap[];
  readonly summary: OverlapSummary;
}

/**
 * « Quels textes couvrent cette photo ? » (contrat §4.3) — la direction
 * inverse de `overlapsPhoto`, MÊME prédicat (`overlap_sql.ts`), jamais une
 * seconde implémentation. `null` si la photo elle-même n'existe pas ; un
 * résultat vide (jamais une erreur) si elle existe mais n'a aucune date
 * résolue — rien à comparer, pas une faute.
 */
const GALLERY_MATCH_OVERLAP: OverlapInfo = {
  rule: OverlapRule.GALLERY_MATCH, photoSpanDays: 0, textSpanDays: 0, totalSpanDays: 0, distanceToCentreDays: 0,
};

/**
 * Les légendes de galerie liées à cette photo par son `sha256` — une
 * IDENTITÉ, jamais un recouvrement de plage (Nicolas, tranché via
 * team-lead) : indépendant de toute date, jamais soumis au repli « photo non
 * datée → vide » qui gouverne le reste de cette fonction. `OverlapRule.
 * GALLERY_MATCH` voyage dans la MÊME forme `OverlapInfo` que les trois autres
 * règles, chaque largeur à zéro — réutilisée, jamais une seconde mécanique
 * (contrat §11 Q11, A5).
 */
async function listGalleryMatchTexts(client: PoolClient, sha256: string): Promise<readonly TextWithOverlap[]> {
  const { rows } = await client.query<GalleryLinkRow>(`
    SELECT wgl.sha256, wgl.page, wgl.image_path, wgl.caption, wgl.alt, wgl.distance, wgl.margin, wgl.verified,
           1 AS ordinal,
           (SELECT count(*)::int FROM pipeline.photo p WHERE p.sha256 = wgl.sha256) AS overlapping_photo_count
      FROM app.web_gallery_link wgl
     WHERE wgl.sha256 = $1 AND (wgl.caption IS NOT NULL OR wgl.alt IS NOT NULL) AND (wgl.verified IS NULL OR wgl.verified = true)`,
    [sha256]);
  return rows.map((row) => ({ ...mapGalleryLinkRow(row), overlap: GALLERY_MATCH_OVERLAP }));
}

export async function listOverlappingTexts(client: PoolClient, cloudAssetId: string): Promise<OverlappingTextsResult | null> {
  const { rows: photoRows } = await client.query<{ sha256: string; resolved_start: string | null; resolved_end: string | null }>(
    `SELECT sha256, resolved_start, resolved_end FROM pipeline.photo WHERE cloud_asset_id = $1`, [cloudAssetId]);
  const photoRow = photoRows[0];
  if (photoRow === undefined) return null;

  const galleryItems = await listGalleryMatchTexts(client, photoRow.sha256);

  // Recouvrement par date — seulement si la photo a une date résolue ; sans
  // ça, l'identité par lien direct ci-dessus reste la SEULE source, jamais
  // rabattue à vide par la règle « pas de date, pas de comparaison ».
  let dateItems: TextWithOverlap[] = [];
  let windowDays = 0;
  if (photoRow.resolved_start !== null && photoRow.resolved_end !== null) {
    const photoWindow = { start: photoRow.resolved_start, end: photoRow.resolved_end };
    windowDays = spanDays(photoWindow);

    const { rows } = await client.query<TextRow & {
      effective_start: string; effective_end: string; effective_rule: string | null;
    }>(`
      SELECT t.kind, t.id, t.document_id, t.page_id, t.ordinal, t.body,
             tc.corrected_text, tc.original_at_correction, tc.corrected_at,
             t.confidence, t.date_source, t.date_start, t.date_end, t.date_kind, t.page_span_source,
             (SELECT count(*)::int FROM pipeline.photo p2
               WHERE p2.resolved_range IS NOT NULL AND ${EFFECTIVE_COVERS_RANGE} IS NOT NULL
                 AND p2.resolved_range && ${EFFECTIVE_COVERS_RANGE}) AS overlapping_photo_count,
             t.entry_time, ST_Y(t.entry_position::geometry) AS entry_lat, ST_X(t.entry_position::geometry) AS entry_lon,
             t.raw_position, t.place_name, t.heading, t.wind, t.baro, t.engine_hours,
             t.fix_confidence, t.remark_confidence,
             ${EFFECTIVE_COVERS_START} AS effective_start, ${EFFECTIVE_COVERS_END} AS effective_end,
             ${EFFECTIVE_COVERS_RULE} AS effective_rule
        FROM pipeline.text_unit t
        JOIN pipeline.document d ON d.id = t.document_id
        LEFT JOIN app.text_correction tc ON tc.text_kind = t.kind AND tc.text_id = t.id
        ${WEB_SPAN_JOIN}
       WHERE ${EFFECTIVE_COVERS_RANGE} IS NOT NULL
         AND daterange($1::date, $2::date, '[]') && ${EFFECTIVE_COVERS_RANGE}`,
      [photoWindow.start, photoWindow.end]);

    dateItems = rows.map((row): TextWithOverlap => ({
      ...mapTextRow(row),
      overlap: computeOverlapInfo(
        photoWindow, { start: row.effective_start, end: row.effective_end }, row.effective_rule ?? '',
      ),
    }));
  }

  // Tri par défaut : la somme des largeurs, croissante (contrat, tâche 21) —
  // une identité (largeur 0) passe naturellement en tête, ce qui est
  // exactement le bon ordre : la certitude avant la conjecture de plage.
  const items = [...galleryItems, ...dateItems].sort((a, b) => a.overlap.totalSpanDays - b.overlap.totalSpanDays);

  const summary: OverlapSummary = {
    matchCount: items.length,
    windowDays,
    datedToDayCount: items.filter((i) => i.date !== null).length,
    // Un texte n'a jamais de date au mois ou à l'année (contrat §2.6 —
    // quand `date` n'est pas nulle, `precision` vaut TOUJOURS `day`).
    datedToMonthCount: 0,
    datedToYearCount: 0,
    undatedCount: items.filter((i) => i.date === null).length,
  };

  return { items, summary };
}

/** `app.text_search` doit refléter le texte EFFECTIF (§8.2) : rafraîchie à chaque écriture d'une correction. */
async function refreshTextSearch(client: PoolClient): Promise<void> {
  // Jamais `CONCURRENTLY` : impossible dans une transaction explicite —
  // repli sur un `REFRESH` simple, un verrou exclusif de quelques
  // millisecondes sur 2 871 lignes, le même choix que l'import (§8.2).
  await client.query(`REFRESH MATERIALIZED VIEW app.text_search`);
}

export interface TextCorrectionInput {
  readonly ref: { readonly kind: string; readonly id: string };
  readonly text: string;
}

/**
 * `original_at_correction` est le TÉMOIN — pas la valeur corrigée, l'amont
 * TEL QU'IL ÉTAIT au moment de corriger (contrat §4.4) : c'est lui, et lui
 * seul, qui permet de détecter une dérive plus tard. `null` : la cible
 * n'existe pas dans `pipeline` — rien à corriger.
 */
export async function putCorrection(client: PoolClient, input: TextCorrectionInput): Promise<TextUnit | null> {
  const { rows } = await client.query<{ body: string }>(
    `SELECT body FROM pipeline.text_unit WHERE kind = $1 AND id = $2`, [input.ref.kind, input.ref.id]);
  const current = rows[0];
  if (current === undefined) return null;

  await client.query(
    `INSERT INTO app.text_correction (text_kind, text_id, corrected_text, original_at_correction, corrected_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (text_kind, text_id) DO UPDATE
       SET corrected_text = EXCLUDED.corrected_text,
           original_at_correction = EXCLUDED.original_at_correction,
           corrected_at = now()`,
    [input.ref.kind, input.ref.id, input.text, current.body],
  );
  await refreshTextSearch(client);
  return await getTextUnit(client, input.ref);
}

/** `null` : la cible n'existe pas dans `pipeline` — rien à rendre, même si la correction, elle, existait encore. */
export async function revertCorrection(
  client: PoolClient, ref: { readonly kind: string; readonly id: string },
): Promise<TextUnit | null> {
  await client.query(`DELETE FROM app.text_correction WHERE text_kind = $1 AND text_id = $2`, [ref.kind, ref.id]);
  await refreshTextSearch(client);
  return await getTextUnit(client, ref);
}

interface CorrectionRow {
  text_kind: string;
  text_id: string;
  corrected_text: string;
  original_at_correction: string;
  corrected_at: string;
  current_body: string | null;
}

function correctionStatus(row: CorrectionRow): 'applied' | 'needs_review' | 'orphaned' {
  if (row.current_body === null) return 'orphaned';
  return row.current_body === row.original_at_correction ? 'applied' : 'needs_review';
}

/**
 * Globale, jamais par tâche (contrat §4.4). `status` absent : tout, quel
 * qu'il soit — les trois états conservent la correction, jamais appliquée
 * en silence ni supprimée.
 */
export async function listCorrections(
  client: PoolClient, status?: 'applied' | 'needs_review' | 'orphaned',
): Promise<readonly TextCorrection[]> {
  const { rows } = await client.query<CorrectionRow>(`
    SELECT c.text_kind, c.text_id, c.corrected_text, c.original_at_correction, c.corrected_at, t.body AS current_body
      FROM app.text_correction c
      LEFT JOIN pipeline.text_unit t ON t.kind = c.text_kind AND t.id = c.text_id
     ORDER BY c.corrected_at DESC`);

  const corrections = rows.map((row): TextCorrection => ({
    ref: { kind: row.text_kind, id: row.text_id },
    text: row.corrected_text,
    originalAtCorrection: row.original_at_correction,
    correctedAt: row.corrected_at,
    status: correctionStatus(row),
  }));
  return status === undefined ? corrections : corrections.filter((c) => c.status === status);
}

const WEB_DOCUMENT_EXCERPT_LENGTH = 200;

/**
 * « Un extrait pour reconnaître le document — aucun de ses passages n'est
 * daté » (contrat §4.8) : le premier passage par ordinal, texte EFFECTIF
 * (corrigé s'il l'a été) — jamais la transcription seule si une correction
 * existe. `pathHint` est l'id du document lui-même : c'est le seul indice.
 */
export async function listWebDocuments(client: PoolClient): Promise<readonly WebDocumentRow[]> {
  const { rows } = await client.query<{
    id: string; title: string; passage_count: number; excerpt: string | null;
    date_from: string | null; date_to: string | null;
  }>(`
    WITH ${WEB_SPAN_CHAIN}
    SELECT d.id, d.title,
           (SELECT count(*)::int FROM pipeline.text_unit t
             WHERE t.document_id = d.id AND t.kind = 'passage') AS passage_count,
           (SELECT coalesce(tc.corrected_text, t.body) FROM pipeline.text_unit t
              LEFT JOIN app.text_correction tc ON tc.text_kind = t.kind AND tc.text_id = t.id
             WHERE t.document_id = d.id AND t.kind = 'passage'
             ORDER BY t.ordinal LIMIT 1) AS excerpt,
           wsc.date_from, wsc.date_to
      FROM pipeline.document d
      LEFT JOIN web_span_chain wsc ON wsc.document_id = d.id
     WHERE d.kind = 'html'
     ORDER BY d.id`);

  return rows.map((row): WebDocumentRow => ({
    documentId: row.id,
    title: row.title,
    passageCount: row.passage_count,
    excerpt: (row.excerpt ?? '').slice(0, WEB_DOCUMENT_EXCERPT_LENGTH),
    span: row.date_from === null || row.date_to === null ? null : {
      start: row.date_from, end: row.date_to, precision: 'day', kind: 'inference', source: 'web_span',
      bracketHours: null,
    },
    pathHint: row.id,
  }));
}

async function isWebDocument(client: PoolClient, documentId: string): Promise<boolean> {
  const { rows } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pipeline.document WHERE id = $1 AND kind = 'html'`, [documentId]);
  return (rows[0]?.n ?? 0) > 0;
}

export interface WebSpanInput {
  readonly documentId: string;
  /**
   * UNE seule borne (amendement A9, spec v1.5) — la fin se calcule à la
   * lecture, jamais stockée : « la date de début du suivant est la date de
   * fin » (Nicolas). Aucun héritage entre documents non datés — un rebut
   * ou un gabarit vide sans date saisie n'a AUCUNE période, jamais une
   * empruntée à son voisin.
   */
  readonly dateFrom: string;
  readonly note: string | null;
}

/** `null` : le document n'existe pas, ou n'est pas `html` — `ref.web_span` ne sert que la règle C. */
export async function putWebSpan(client: PoolClient, input: WebSpanInput): Promise<TextDocument | null> {
  if (!await isWebDocument(client, input.documentId)) return null;

  await client.query(
    `INSERT INTO ref.web_span (document_id, date_from, date_to, note, updated_at)
     VALUES ($1, $2, NULL, $3, now())
     ON CONFLICT (document_id) DO UPDATE
       SET date_from = EXCLUDED.date_from, date_to = NULL, note = EXCLUDED.note, updated_at = now()`,
    [input.documentId, input.dateFrom, input.note],
  );
  return await getTextDocument(client, input.documentId);
}

export async function deleteWebSpan(client: PoolClient, documentId: string): Promise<TextDocument | null> {
  if (!await isWebDocument(client, documentId)) return null;

  await client.query(`DELETE FROM ref.web_span WHERE document_id = $1`, [documentId]);
  return await getTextDocument(client, documentId);
}

/** `SystemStatus.attention.webDocumentsWithoutSpan` (contrat §9) — un document `html` qu'une saisie de `ref.web_span` daterait. */
export async function countWebDocumentsWithoutSpan(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ n: number }>(`
    SELECT count(*)::int AS n
      FROM pipeline.document d
     WHERE d.kind = 'html' AND NOT EXISTS (SELECT 1 FROM ref.web_span ws WHERE ws.document_id = d.id)`);
  return rows[0]?.n ?? 0;
}
