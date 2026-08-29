import type { DateSource } from '@shared/enums';
import type { PoolClient } from '../db/pool.ts';
import type { LogEntryFields, TextCorrection, TextDocument, TextPage, TextUnit } from '../contract/text_interface.ts';
import { overlapPredicate } from '../metier/overlap/overlap_sql.ts';

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

/** 62 documents (contrat §4.3) — assez petit pour un aller-retour sans filtre. */
export async function listDocuments(client: PoolClient): Promise<readonly TextDocument[]> {
  const { rows } = await client.query<DocumentRow>(`
    SELECT d.id, d.kind, d.title, d.page_count, d.has_pages,
           (SELECT count(*)::int FROM pipeline.text_unit t
             WHERE t.document_id = d.id AND t.kind = 'passage') AS passage_count,
           ws.date_from, ws.date_to
      FROM pipeline.document d
      LEFT JOIN ref.web_span ws ON ws.document_id = d.id
     ORDER BY d.id`);
  return rows.map(mapDocumentRow);
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
}

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
    imageUrl: `/pages/image?pageId=${encodeURIComponent(row.id)}`,
    // `pages.region` est NULL sur les 155 lignes (contrat) — jamais promis.
    regionsAvailable: false,
  };
}

export async function listPages(client: PoolClient, documentId?: string): Promise<readonly TextPage[]> {
  const { rows } = documentId === undefined
    ? await client.query<PageRow>(`SELECT * FROM pipeline.page ORDER BY document_id, ordinal`)
    : await client.query<PageRow>(
      `SELECT * FROM pipeline.page WHERE document_id = $1 ORDER BY ordinal`, [documentId]);
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
  readonly limit?: number;
  readonly offset?: number;
  readonly sort?: 'page' | 'date';
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
  };
}

export async function listTexts(client: PoolClient, filters: TextFilters): Promise<ListTextsResult> {
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
      + `AND ${overlapPredicate('p', 't')})`);
  }

  const whereClause = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`;
  const sortSql = filters.sort === 'date' ? 't.date_start ASC NULLS LAST, t.id' : 'd.id, t.page_id, t.ordinal';

  const { rows: totalRows } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM pipeline.text_unit t
       JOIN pipeline.document d ON d.id = t.document_id
      ${whereClause}`, values);
  const total = totalRows[0]?.n ?? 0;

  const limitClause = filters.limit !== undefined ? ` LIMIT ${param(filters.limit)}` : '';
  const offsetClause = filters.offset !== undefined ? ` OFFSET ${param(filters.offset)}` : '';

  const { rows } = await client.query<TextRow>(`
    SELECT t.kind, t.id, t.document_id, t.page_id, t.ordinal, t.body,
           tc.corrected_text, tc.original_at_correction, tc.corrected_at,
           t.confidence, t.date_source, t.date_start, t.date_end, t.date_kind, t.page_span_source,
           (SELECT count(*)::int FROM pipeline.photo p
             WHERE ${overlapPredicate('p', 't')}) AS overlapping_photo_count,
           t.entry_time, ST_Y(t.entry_position::geometry) AS entry_lat, ST_X(t.entry_position::geometry) AS entry_lon,
           t.raw_position, t.place_name, t.heading, t.wind, t.baro, t.engine_hours,
           t.fix_confidence, t.remark_confidence
      FROM pipeline.text_unit t
      JOIN pipeline.document d ON d.id = t.document_id
      LEFT JOIN app.text_correction tc ON tc.text_kind = t.kind AND tc.text_id = t.id
     ${whereClause}
     ORDER BY ${sortSql}
     ${limitClause}${offsetClause}`, values);

  return { items: rows.map(mapTextRow), total };
}
