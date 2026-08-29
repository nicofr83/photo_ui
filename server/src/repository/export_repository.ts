import type { PoolClient } from '../db/pool.ts';
import { mapPhotoRow, type PhotoRow } from '../metier/photos/map_photo_row.ts';

export interface ExportImage {
  readonly cloudAssetId: string;
  readonly sha256: string;
  readonly relativePath: string;
  readonly format: string;
  readonly albumPath: string | null;
  readonly groupName: string | null;
  readonly date: {
    readonly start: string; readonly end: string; readonly precision: string;
    readonly kind: string; readonly source: string; readonly bracketHours: number | null;
  } | null;
  readonly position: { readonly lat: number; readonly lon: number; readonly kind: string; readonly source: string } | null;
  readonly people: readonly string[];
  readonly place: { readonly city: string | null; readonly country: string | null };
}

/**
 * En UNE requête batchée — même discipline que `task_repository.loadPhotoInfo`
 * (tâche 17) : un export de 286 photos n'ouvre pas 286 connexions.
 * `mapPhotoRow` fait déjà le travail de mise en forme (date/position), la
 * même fonction qui sert `GET /photos` — aucune seconde implémentation qui
 * pourrait diverger.
 */
export async function loadExportImages(
  client: PoolClient, cloudAssetIds: readonly string[],
): Promise<Map<string, ExportImage>> {
  const images = new Map<string, ExportImage>();
  if (cloudAssetIds.length === 0) return images;

  const { rows } = await client.query<PhotoRow & { relative_path: string }>(`
    SELECT p.*, coalesce(ca.normalized, p.country_raw) AS country,
           ST_Y(p.position::geometry) AS lat, ST_X(p.position::geometry) AS lon,
           EXISTS (SELECT 1 FROM app.photo_caption c WHERE c.sha256 = p.sha256) AS has_caption,
           (SELECT coalesce(array_agg(pp.person_name ORDER BY pp.person_name), '{}')
              FROM pipeline.photo_person pp WHERE pp.cloud_asset_id = p.cloud_asset_id) AS people,
           '{}'::text[] AS in_task_slugs,
           '[]'::jsonb AS matched_on
      FROM pipeline.photo p
      LEFT JOIN ref.country_alias ca ON ca.raw = p.country_raw
     WHERE p.cloud_asset_id = ANY($1::char(32)[])`, [cloudAssetIds]);

  for (const row of rows) {
    const item = mapPhotoRow(row);
    images.set(row.cloud_asset_id, {
      cloudAssetId: item.cloudAssetId,
      sha256: item.sha256,
      relativePath: row.relative_path,
      format: item.format,
      albumPath: item.albumPath,
      groupName: item.groupName,
      date: item.date,
      position: item.position,
      people: item.people,
      place: { city: item.place.city, country: item.place.country },
    });
  }
  return images;
}

export interface ExportText {
  readonly kind: string;
  readonly id: string;
  readonly documentId: string;
  readonly pageId: string | null;
  readonly body: string;
  readonly correctedText: string | null;
  readonly dateSource: string | null;
  readonly dateStart: string | null;
  readonly dateEnd: string | null;
  readonly dateKind: string | null;
  readonly coversStart: string | null;
  readonly coversEnd: string | null;
  readonly coversRule: string | null;
  readonly pageSpanSource: string | null;
}

const TEXT_KINDS_WITH_TABLE_SUPPORT = ['passage', 'log_entry'];

/**
 * `pipeline.text_unit` n'a que 2 `kind` possibles au niveau du CHECK (`passage`,
 * `log_entry`) — group par kind pour rester en requêtes batchées plutôt qu'une
 * par texte, sans construire une clause `(kind, id) IN (...)` sur des tuples.
 */
export async function loadExportTexts(
  client: PoolClient, refs: readonly { readonly kind: string; readonly id: string }[],
): Promise<Map<string, ExportText>> {
  const texts = new Map<string, ExportText>();
  const byKind = new Map<string, string[]>();
  for (const ref of refs) {
    if (!TEXT_KINDS_WITH_TABLE_SUPPORT.includes(ref.kind)) continue;
    const ids = byKind.get(ref.kind) ?? [];
    ids.push(ref.id);
    byKind.set(ref.kind, ids);
  }

  for (const [kind, ids] of byKind) {
    const { rows } = await client.query<{
      kind: string; id: string; document_id: string; page_id: string | null; body: string;
      corrected_text: string | null;
      date_source: string | null; date_start: string | null; date_end: string | null; date_kind: string | null;
      covers_start: string | null; covers_end: string | null; covers_rule: string | null;
      page_span_source: string | null;
    }>(`
      SELECT t.kind, t.id, t.document_id, t.page_id, t.body,
             tc.corrected_text,
             t.date_source, t.date_start, t.date_end, t.date_kind,
             t.covers_start, t.covers_end, t.covers_rule, t.page_span_source
        FROM pipeline.text_unit t
        LEFT JOIN app.text_correction tc ON tc.text_kind = t.kind AND tc.text_id = t.id
       WHERE t.kind = $1 AND t.id = ANY($2)`, [kind, ids]);
    for (const row of rows) {
      texts.set(`${row.kind}/${row.id}`, {
        kind: row.kind, id: row.id, documentId: row.document_id, pageId: row.page_id, body: row.body,
        correctedText: row.corrected_text,
        dateSource: row.date_source, dateStart: row.date_start, dateEnd: row.date_end, dateKind: row.date_kind,
        coversStart: row.covers_start, coversEnd: row.covers_end, coversRule: row.covers_rule,
        pageSpanSource: row.page_span_source,
      });
    }
  }
  return texts;
}

/**
 * Quelles images sélectionnées (parmi celles EXPORTÉES — le manifeste est
 * autosuffisant, il ne référence jamais une image absente du dossier) un
 * texte COUVRE — même opérateur `&&`, jamais reconstruit en JS à partir des
 * bornes : une seule requête pour tous les textes d'un coup.
 */
export async function loadCoversImages(
  client: PoolClient, textRefs: readonly { readonly kind: string; readonly id: string }[],
  exportedCloudAssetIds: readonly string[],
): Promise<Map<string, readonly string[]>> {
  const coversByText = new Map<string, readonly string[]>();
  if (textRefs.length === 0 || exportedCloudAssetIds.length === 0) return coversByText;

  const { rows } = await client.query<{ kind: string; id: string; cloud_asset_id: string }>(`
    SELECT t.kind, t.id, ph.cloud_asset_id
      FROM pipeline.text_unit t
      JOIN pipeline.photo ph ON ph.resolved_range IS NOT NULL AND t.covers_range IS NOT NULL
                             AND ph.resolved_range && t.covers_range
     WHERE (t.kind, t.id) IN (SELECT * FROM unnest($1::text[], $2::text[]))
       AND ph.cloud_asset_id = ANY($3::char(32)[])`,
    [textRefs.map((r) => r.kind), textRefs.map((r) => r.id), exportedCloudAssetIds]);

  for (const row of rows) {
    const key = `${row.kind}/${row.id}`;
    coversByText.set(key, [...(coversByText.get(key) ?? []), row.cloud_asset_id]);
  }
  return coversByText;
}

export interface ExportDocument {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
}

export async function loadExportDocuments(
  client: PoolClient, documentIds: readonly string[],
): Promise<Map<string, ExportDocument>> {
  const documents = new Map<string, ExportDocument>();
  if (documentIds.length === 0) return documents;
  const { rows } = await client.query<{ id: string; title: string; kind: string }>(
    `SELECT id, title, kind FROM pipeline.document WHERE id = ANY($1)`, [documentIds]);
  for (const row of rows) documents.set(row.id, row);
  return documents;
}

export async function loadPageImageRelpaths(
  client: PoolClient, pageIds: readonly string[],
): Promise<Map<string, string>> {
  const paths = new Map<string, string>();
  if (pageIds.length === 0) return paths;
  const { rows } = await client.query<{ id: string; image_relpath: string }>(
    `SELECT id, image_relpath FROM pipeline.page WHERE id = ANY($1)`, [pageIds]);
  for (const row of rows) paths.set(row.id, row.image_relpath);
  return paths;
}
