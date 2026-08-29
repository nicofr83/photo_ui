import { DateKind, DatePrecision, DateSource, PositionSource } from '@shared/enums';
import type { PoolClient } from '../db/pool.ts';
import type { AppliedFilter, UnmatchedFilterValue } from '../contract/filter_interface.ts';
import type {
  DatingDoubt, DatingProposal, DoubtCandidate, PhotoDetail, PhotoExif, PhotoListItem, PhotoTag,
} from '../contract/photo_interface.ts';
import { cleanSearchQuery } from '../metier/search/clean_query.ts';
import { mapPhotoRow, type PhotoRow } from '../metier/photos/map_photo_row.ts';

export interface PhotoFilters {
  readonly scope?: 'hierarchy' | 'out_of_hierarchy' | 'all';
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly reliableDatesOnly?: boolean;
  readonly albumPath?: readonly string[];
  readonly tag?: readonly string[];
  readonly tagMinConfidence?: number;
  readonly person?: readonly string[];
  readonly country?: readonly string[];
  readonly city?: readonly string[];
  readonly hasPosition?: boolean;
  readonly hasOcr?: boolean;
  readonly hasCaption?: boolean;
  readonly q?: string;
  readonly overlapsTextKind?: string;
  readonly overlapsTextId?: string;
  readonly inTask?: readonly string[];
  readonly notInTask?: readonly string[];
  readonly sort?: 'date_asc' | 'date_desc' | 'aesthetics_desc' | 'album' | 'overlap';
  readonly limit?: number;
  readonly offset?: number;
}

export interface ListPhotosResult {
  readonly items: readonly PhotoListItem[];
  readonly total: number;
  readonly populationTotal: number;
  readonly filters: { readonly applied: readonly AppliedFilter[]; readonly unmatchedValues: readonly UnmatchedFilterValue[] };
}

/** Un accumulateur de conditions paramétrées — numérote les `$n` au fil de l'eau. */
class QueryBuilder {
  private readonly params: unknown[] = [];
  private readonly conditions: string[] = [];

  param(value: unknown): string {
    this.params.push(value);
    return `$${String(this.params.length)}`;
  }

  where(sql: string): void {
    this.conditions.push(sql);
  }

  get whereClause(): string {
    return this.conditions.length === 0 ? '' : `WHERE ${this.conditions.join(' AND ')}`;
  }

  get values(): unknown[] {
    return this.params;
  }
}

/** `place_country`/`place_city` : recherche généreuse, `album_path` et `group_name` répondent aussi. */
const PLACE_BROADENING_COLUMNS = ['album_path', 'group_name'] as const;

function placeCondition(
  qb: QueryBuilder, values: readonly string[], primaryColumn: 'country' | 'city',
): { sql: string; matchExprs: { field: string; expr: string }[] } {
  const exprs: { field: string; expr: string }[] = [];
  const orClauses: string[] = [];
  for (const value of values) {
    const p = qb.param(`%${escapeLike(value)}%`);
    const primaryExpr = primaryColumn === 'country'
      ? `unaccent(lower(coalesce(ca.normalized, p.country_raw)))`
      : `unaccent(lower(p.city))`;
    const primaryField = primaryColumn === 'country' ? 'place_country' : 'place_city';
    orClauses.push(`${primaryExpr} LIKE unaccent(lower(${p}))`);
    exprs.push({ field: primaryField, expr: `${primaryExpr} LIKE unaccent(lower(${p}))` });
    for (const col of PLACE_BROADENING_COLUMNS) {
      const colExpr = `unaccent(lower(p.${col}))`;
      orClauses.push(`${colExpr} LIKE unaccent(lower(${p}))`);
      exprs.push({ field: col, expr: `${colExpr} LIKE unaccent(lower(${p}))` });
    }
  }
  return { sql: `(${orClauses.join(' OR ')})`, matchExprs: exprs };
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

const SORT_SQL: Record<NonNullable<PhotoFilters['sort']>, string> = {
  date_asc: 'p.resolved_start ASC NULLS LAST, p.cloud_asset_id',
  date_desc: 'p.resolved_start DESC NULLS LAST, p.cloud_asset_id',
  aesthetics_desc: 'p.aesthetics_score DESC NULLS LAST, p.cloud_asset_id',
  album: 'p.album_path ASC NULLS LAST, p.cloud_asset_id',
  // Pas de recouvrement matérialisé (§8.1) : sans overlapsText, ce tri dégénère au tri par date.
  overlap: 'p.resolved_start ASC NULLS LAST, p.cloud_asset_id',
};

export async function listPhotos(client: PoolClient, filters: PhotoFilters): Promise<ListPhotosResult> {
  const applied: AppliedFilter[] = [];
  const unmatchedValues: UnmatchedFilterValue[] = [];

  // ---- portée (scope) : compte la POPULATION avant tout autre filtre ----
  const scopeQb = new QueryBuilder();
  applyScope(scopeQb, filters.scope ?? 'hierarchy');
  const { rows: popRows } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pipeline.photo p ${scopeQb.whereClause}`, scopeQb.values);
  const populationTotal = popRows[0]?.n ?? 0;

  // ---- le reste des filtres, sur la même portée ----
  const qb = new QueryBuilder();
  applyScope(qb, filters.scope ?? 'hierarchy');
  const matchExprsByRow: { field: string; expr: string }[] = [];

  if (filters.dateFrom !== undefined && filters.dateTo !== undefined) {
    const from = qb.param(filters.dateFrom);
    const to = qb.param(filters.dateTo);
    // CHEVAUCHEMENT, jamais l'inclusion — invariant 3. `&&` élimine la
    // possibilité même de se tromper de sens d'inégalité.
    qb.where(`p.resolved_range && daterange(${from}::date, ${to}::date, '[]')`);
    applied.push({ parameter: 'dateFrom', values: [filters.dateFrom], broadened: false });
    applied.push({ parameter: 'dateTo', values: [filters.dateTo], broadened: false });
  }

  if (filters.reliableDatesOnly === true) {
    qb.where(`p.resolved_precision = 'day'`);
    applied.push({ parameter: 'reliableDatesOnly', values: ['true'], broadened: false });
  }

  if (filters.albumPath !== undefined && filters.albumPath.length > 0) {
    const known = await unmatchedFor(client, 'pipeline.album', 'path', filters.albumPath);
    for (const value of known.unmatched) {
      unmatchedValues.push({ parameter: 'albumPath', value, nearest: await nearest(client, 'pipeline.album', 'path', value) });
    }
    if (known.matched.length > 0) {
      const p = qb.param(known.matched);
      qb.where(`EXISTS (SELECT 1 FROM pipeline.photo_album pa
                          WHERE pa.cloud_asset_id = p.cloud_asset_id AND pa.album_path = ANY(${p}::text[]))`);
    } else {
      qb.where('false');
    }
    applied.push({ parameter: 'albumPath', values: [...filters.albumPath], broadened: false });
  }

  if (filters.tag !== undefined && filters.tag.length > 0) {
    const known = await unmatchedFor(client, 'pipeline.tag', 'name', filters.tag);
    for (const value of known.unmatched) {
      unmatchedValues.push({ parameter: 'tag', value, nearest: await nearest(client, 'pipeline.tag', 'name', value) });
    }
    if (known.matched.length > 0) {
      const p = qb.param(known.matched);
      // Un tag sans confiance n'est JAMAIS écarté : `confidence IS NULL` reste
      // acceptée même quand un plancher est demandé.
      const confidenceCondition = filters.tagMinConfidence === undefined
        ? ''
        : ` AND (pt.confidence IS NULL OR pt.confidence >= ${qb.param(filters.tagMinConfidence)})`;
      qb.where(`EXISTS (SELECT 1 FROM pipeline.photo_tag pt
                          WHERE pt.cloud_asset_id = p.cloud_asset_id AND pt.tag_name = ANY(${p}::text[])
                                ${confidenceCondition})`);
    } else {
      qb.where('false');
    }
    applied.push({ parameter: 'tag', values: [...filters.tag], broadened: false });
    if (filters.tagMinConfidence !== undefined) {
      applied.push({ parameter: 'tagMinConfidence', values: [String(filters.tagMinConfidence)], broadened: false });
    }
  }

  if (filters.person !== undefined && filters.person.length > 0) {
    const known = await unmatchedForPerson(client, filters.person);
    for (const value of known.unmatched) {
      unmatchedValues.push({ parameter: 'person', value, nearest: await nearest(client, 'pipeline.person', 'name', value) });
    }
    if (known.matched.length > 0) {
      // `known.matched` porte déjà le nom TEL QUE STOCKÉ (résolu insensible aux
      // accents dans `unmatchedForPerson`) : égalité exacte ici, pas de second `unaccent`.
      const p = qb.param(known.matched);
      qb.where(`EXISTS (SELECT 1 FROM pipeline.photo_person pp
                          WHERE pp.cloud_asset_id = p.cloud_asset_id AND pp.person_name = ANY(${p}::text[]))`);
    } else {
      qb.where('false');
    }
    applied.push({ parameter: 'person', values: [...filters.person], broadened: false });
  }

  if (filters.country !== undefined && filters.country.length > 0) {
    const { sql, matchExprs } = placeCondition(qb, filters.country, 'country');
    qb.where(sql);
    matchExprsByRow.push(...matchExprs);
    applied.push({ parameter: 'country', values: [...filters.country], broadened: true });
  }

  if (filters.city !== undefined && filters.city.length > 0) {
    const { sql, matchExprs } = placeCondition(qb, filters.city, 'city');
    qb.where(sql);
    matchExprsByRow.push(...matchExprs);
    applied.push({ parameter: 'city', values: [...filters.city], broadened: true });
  }

  if (filters.hasPosition === true) { qb.where('p.position IS NOT NULL'); applied.push({ parameter: 'hasPosition', values: ['true'], broadened: false }); }
  if (filters.hasPosition === false) { qb.where('p.position IS NULL'); applied.push({ parameter: 'hasPosition', values: ['false'], broadened: false }); }
  if (filters.hasOcr === true) { qb.where(`p.ocr_text IS NOT NULL`); applied.push({ parameter: 'hasOcr', values: ['true'], broadened: false }); }
  if (filters.hasOcr === false) { qb.where(`p.ocr_text IS NULL`); applied.push({ parameter: 'hasOcr', values: ['false'], broadened: false }); }
  if (filters.hasCaption === true) {
    qb.where(`EXISTS (SELECT 1 FROM app.photo_caption c WHERE c.sha256 = p.sha256)`);
    applied.push({ parameter: 'hasCaption', values: ['true'], broadened: false });
  }
  if (filters.hasCaption === false) {
    qb.where(`NOT EXISTS (SELECT 1 FROM app.photo_caption c WHERE c.sha256 = p.sha256)`);
    applied.push({ parameter: 'hasCaption', values: ['false'], broadened: false });
  }

  if (filters.q !== undefined && filters.q.trim() !== '') {
    const cleaned = cleanSearchQuery(filters.q);
    if (cleaned === null) {
      unmatchedValues.push({ parameter: 'q', value: filters.q, nearest: [] });
      qb.where('false');
    } else {
      const tsq = qb.param(cleaned);
      qb.where(`(p.search_meta @@ plainto_tsquery('public.fr_unaccent', ${tsq})
              OR p.search_ocr  @@ plainto_tsquery('public.fr_unaccent', ${tsq})
              OR EXISTS (SELECT 1 FROM app.photo_caption c
                          WHERE c.sha256 = p.sha256 AND c.search_caption @@ plainto_tsquery('public.fr_unaccent', ${tsq})))`);
    }
    applied.push({ parameter: 'q', values: [filters.q], broadened: false });
  }

  if (filters.inTask !== undefined && filters.inTask.length > 0) {
    const p = qb.param(filters.inTask);
    qb.where(`EXISTS (SELECT 1 FROM app.task_image ti
                        WHERE ti.cloud_asset_id = p.cloud_asset_id AND ti.task_slug = ANY(${p}::text[]))`);
    applied.push({ parameter: 'inTask', values: [...filters.inTask], broadened: false });
  }
  if (filters.notInTask !== undefined && filters.notInTask.length > 0) {
    const p = qb.param(filters.notInTask);
    qb.where(`NOT EXISTS (SELECT 1 FROM app.task_image ti
                            WHERE ti.cloud_asset_id = p.cloud_asset_id AND ti.task_slug = ANY(${p}::text[]))`);
    applied.push({ parameter: 'notInTask', values: [...filters.notInTask], broadened: false });
  }

  if (filters.overlapsTextKind !== undefined && filters.overlapsTextId !== undefined) {
    const kind = qb.param(filters.overlapsTextKind);
    const id = qb.param(filters.overlapsTextId);
    // Aucun plafond de largeur (§5.3) : l'opérateur `&&`, jamais une inégalité.
    qb.where(`EXISTS (SELECT 1 FROM pipeline.text_unit t
                        WHERE t.kind = ${kind} AND t.id = ${id} AND p.resolved_range && t.covers_range)`);
    applied.push({ parameter: 'overlapsTextKind', values: [filters.overlapsTextKind], broadened: false });
    applied.push({ parameter: 'overlapsTextId', values: [filters.overlapsTextId], broadened: false });
  }

  const matchedOnSelect = matchExprsByRow.length === 0 ? `'[]'::jsonb` : `(
    SELECT coalesce(jsonb_agg(jsonb_build_object('field', m.field, 'value', m.value)), '[]'::jsonb)
      FROM (VALUES ${matchExprsByRow.map((m) =>
        `('${m.field}', CASE WHEN ${m.expr} THEN coalesce(ca.normalized, p.country_raw, p.city, p.album_path, p.group_name) END)`,
      ).join(', ')}) AS m(field, value)
     WHERE m.value IS NOT NULL
  )`;

  const { rows: totalRows } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pipeline.photo p
       LEFT JOIN ref.country_alias ca ON ca.raw = p.country_raw
     ${qb.whereClause}`, qb.values);
  const total = totalRows[0]?.n ?? 0;

  const limitClause = filters.limit !== undefined ? ` LIMIT ${qb.param(filters.limit)}` : '';
  const offsetClause = filters.offset !== undefined ? ` OFFSET ${qb.param(filters.offset)}` : '';
  const sortSql = SORT_SQL[filters.sort ?? 'date_asc'];

  const { rows } = await client.query<PhotoRow>(
    `SELECT p.*, coalesce(ca.normalized, p.country_raw) AS country,
            ST_Y(p.position::geometry) AS lat, ST_X(p.position::geometry) AS lon,
            EXISTS (SELECT 1 FROM app.photo_caption c WHERE c.sha256 = p.sha256) AS has_caption,
            (SELECT coalesce(array_agg(pp.person_name ORDER BY pp.person_name), '{}')
               FROM pipeline.photo_person pp WHERE pp.cloud_asset_id = p.cloud_asset_id) AS people,
            (SELECT coalesce(array_agg(ti.task_slug ORDER BY ti.task_slug), '{}')
               FROM app.task_image ti WHERE ti.cloud_asset_id = p.cloud_asset_id) AS in_task_slugs,
            ${matchedOnSelect} AS matched_on
       FROM pipeline.photo p
       LEFT JOIN ref.country_alias ca ON ca.raw = p.country_raw
     ${qb.whereClause}
     ORDER BY ${sortSql}
     ${limitClause}${offsetClause}`,
    qb.values,
  );

  return {
    items: rows.map((row) => mapPhotoRow(row)),
    total, populationTotal,
    filters: { applied, unmatchedValues },
  };
}

function applyScope(qb: QueryBuilder, scope: NonNullable<PhotoFilters['scope']>): void {
  if (scope === 'all') return;
  const inHierarchy = `EXISTS (SELECT 1 FROM pipeline.photo_album pa
                                 JOIN pipeline.album a ON a.path = pa.album_path AND a.in_perimeter
                                WHERE pa.cloud_asset_id = p.cloud_asset_id)`;
  qb.where(scope === 'hierarchy' ? inHierarchy : `NOT ${inHierarchy}`);
}

/** Sépare, parmi les valeurs demandées, celles qui existent EXACTEMENT des inconnues. */
async function unmatchedFor(
  client: PoolClient, table: string, column: string, values: readonly string[],
): Promise<{ matched: string[]; unmatched: string[] }> {
  const { rows } = await client.query<{ v: string }>(
    `SELECT DISTINCT ${column} AS v FROM ${table} WHERE ${column} = ANY($1::text[])`, [values]);
  const existing = new Set(rows.map((r) => r.v));
  return { matched: values.filter((v) => existing.has(v)), unmatched: values.filter((v) => !existing.has(v)) };
}

/**
 * Même chose, mais insensible aux accents et à la casse (§5.3, `person`) —
 * la comparaison se fait DES DEUX CÔTÉS en SQL, jamais par une normalisation
 * JS qui divergerait de ce que `unaccent()` fait réellement en base.
 * `matched` rend le nom TEL QU'IL EST STOCKÉ, pour que l'appelant compare
 * ensuite par égalité exacte plutôt que de refaire `unaccent(lower(...))`.
 */
async function unmatchedForPerson(
  client: PoolClient, values: readonly string[],
): Promise<{ matched: string[]; unmatched: string[] }> {
  const { rows } = await client.query<{ requested: string; found: string | null }>(
    `SELECT req AS requested,
            (SELECT name FROM pipeline.person
              WHERE unaccent(lower(name)) = unaccent(lower(req)) LIMIT 1) AS found
       FROM unnest($1::text[]) AS req`,
    [values],
  );
  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const row of rows) {
    if (row.found === null) unmatched.push(row.requested);
    else matched.push(row.found);
  }
  return { matched, unmatched };
}

async function nearest(client: PoolClient, table: string, column: string, value: string): Promise<string[]> {
  const { rows } = await client.query<{ v: string }>(
    `SELECT ${column} AS v FROM ${table}
      WHERE similarity(${column}, $1) > 0.2
      ORDER BY similarity(${column}, $1) DESC LIMIT 3`,
    [value],
  );
  return rows.map((r) => r.v);
}

/**
 * `PhotoDetail` — `proposal`/`doubt` sont des champs de PREMIER NIVEAU, jamais
 * fondus dans `date` : `proposal` n'apparaît que quand `dating_proposal.date_source
 * = 'logbook-bracket'` — le même gate que `cascade.ts`, pour la même raison. Une
 * ligne `manual` est une décision humaine ; l'afficher ici comme un rang 3
 * referait, à l'écran, exactement la faute que le gate corrige en base.
 */
export async function getPhotoDetail(client: PoolClient, cloudAssetId: string): Promise<PhotoDetail | null> {
  const { rows } = await client.query<PhotoRow & {
    relative_path: string; file_size: number | null; ocr_text: string | null;
    camera_make: string | null; camera_model: string | null; lens: string | null;
    iso: number | null; aperture: number | null; shutter: string | null; focal_length: number | null;
    altitude_m: number | null;
    album_paths: readonly string[];
    tags: readonly { name: string; confidence: number | null }[];
    overlapping_text_count: number;
  }>(`
    SELECT p.*, coalesce(ca.normalized, p.country_raw) AS country,
           ST_Y(p.position::geometry) AS lat, ST_X(p.position::geometry) AS lon,
           EXISTS (SELECT 1 FROM app.photo_caption c WHERE c.sha256 = p.sha256) AS has_caption,
           '[]'::jsonb AS matched_on,
           (SELECT coalesce(array_agg(pp.person_name ORDER BY pp.person_name), '{}')
              FROM pipeline.photo_person pp WHERE pp.cloud_asset_id = p.cloud_asset_id) AS people,
           (SELECT coalesce(array_agg(ti.task_slug ORDER BY ti.task_slug), '{}')
              FROM app.task_image ti WHERE ti.cloud_asset_id = p.cloud_asset_id) AS in_task_slugs,
           (SELECT coalesce(array_agg(pa.album_path ORDER BY pa.album_path), '{}')
              FROM pipeline.photo_album pa WHERE pa.cloud_asset_id = p.cloud_asset_id) AS album_paths,
           (SELECT coalesce(jsonb_agg(jsonb_build_object('name', pt.tag_name, 'confidence', pt.confidence)
                                       ORDER BY pt.tag_name), '[]'::jsonb)
              FROM pipeline.photo_tag pt WHERE pt.cloud_asset_id = p.cloud_asset_id) AS tags,
           (SELECT count(*)::int FROM pipeline.text_unit t
             WHERE p.resolved_range IS NOT NULL AND p.resolved_range && t.covers_range) AS overlapping_text_count
      FROM pipeline.photo p
      LEFT JOIN ref.country_alias ca ON ca.raw = p.country_raw
     WHERE p.cloud_asset_id = $1`, [cloudAssetId]);

  const row = rows[0];
  if (row === undefined) return null;

  const { rows: proposalRows } = await client.query<{
    proposed_date: string; date_source: string; span_hours: number | null; evidence_entry_ids: readonly string[];
    lat: number | null; lon: number | null; position_source: string | null;
  }>(`SELECT proposed_date, date_source, span_hours, evidence_entry_ids,
             ST_Y(position::geometry) AS lat, ST_X(position::geometry) AS lon, position_source
        FROM pipeline.dating_proposal WHERE cloud_asset_id = $1`, [cloudAssetId]);
  const proposalRow = proposalRows[0];
  // Le même gate que le rang 3 de la cascade — voir cascade.ts et le correctif du rang 3.
  const proposal: DatingProposal | null = proposalRow === undefined || proposalRow.date_source !== 'logbook-bracket'
    ? null
    : {
        date: {
          start: proposalRow.proposed_date, end: proposalRow.proposed_date,
          precision: DatePrecision.DAY, kind: DateKind.INFERENCE, source: DateSource.LOGBOOK_BRACKET,
          bracketHours: proposalRow.span_hours,
        },
        position: proposalRow.lat === null || proposalRow.lon === null ? null : {
          lat: proposalRow.lat, lon: proposalRow.lon, kind: DateKind.INFERENCE,
          source: (proposalRow.position_source ?? PositionSource.LOGBOOK_INTERPOLATED) as PositionSource,
        },
        evidenceEntryIds: proposalRow.evidence_entry_ids,
      };

  const { rows: doubtRows } = await client.query<{
    reason: string; label: string | null; album_path: string; candidates: readonly DoubtCandidate[];
  }>(`SELECT d.reason, dr.label, d.album_path, d.candidates
        FROM pipeline.dating_doubt d
        LEFT JOIN ref.doubt_reason dr ON dr.reason = d.reason
       WHERE d.cloud_asset_id = $1`, [cloudAssetId]);
  const doubtRow = doubtRows[0];
  const doubt: DatingDoubt | null = doubtRow === undefined ? null : {
    reason: doubtRow.reason, label: doubtRow.label, albumPath: doubtRow.album_path,
    candidates: doubtRow.candidates,
  };

  const exif: PhotoExif = {
    cameraMake: row.camera_make, cameraModel: row.camera_model, lens: row.lens,
    iso: row.iso, aperture: row.aperture, shutter: row.shutter, focalLength: row.focal_length,
    altitude: row.altitude_m,
  };
  const tags: PhotoTag[] = row.tags.map((t) => ({ name: t.name, confidence: t.confidence }));

  return {
    ...mapPhotoRow(row),
    albumPaths: row.album_paths,
    tags,
    exif,
    ocrText: row.ocr_text,
    fileSize: row.file_size,
    relativePath: row.relative_path,
    proposal,
    doubt,
    overlappingTextCount: row.overlapping_text_count,
    // La passe de légendage n'a jamais tourné (D9).
    caption: null,
    // Rempli par le contrôleur, qui seul connaît `ORIGINALS_ROOT` (tâche 15).
    render: { available: true, unavailableReason: null, cached: false },
  };
}
