import type { PoolClient } from '../db/pool.ts';
import type { Album, AlbumSpanUpdateResult } from '../contract/photo_interface.ts';
import { extractFileNamePatterns } from '../metier/albums/file_name_patterns.ts';
import { albumInterval, type AlbumInterval } from '../metier/dating/album_span.ts';
import { computeAlbumSpanWarnings, recomputeAlbum } from '../metier/dating/recompute_album.ts';

interface AlbumRow {
  readonly path: string;
  readonly set_name: string | null;
  readonly album_name: string;
  readonly group_name: string | null;
  readonly photo_count: number;
  readonly prefix_year: number | null;
  readonly prefix_month: number | null;
  readonly span_from: string | null;
  readonly span_to: string | null;
  readonly span_presumed: boolean | null;
  readonly suspected_range: boolean;
  readonly note: string | null;
  readonly file_names: readonly string[];
  readonly rejected_exif_from: string | null;
  readonly rejected_exif_to: string | null;
  readonly rejected_exif_count: number;
}

const ALBUM_SELECT = `
    SELECT a.path, a.set_name, a.album_name, a.group_name, a.photo_count,
           a.prefix_year, a.prefix_month, a.span_from, a.span_to, a.span_presumed,
           a.suspected_range, rs.note,
           coalesce((SELECT array_agg(p.file_name) FROM pipeline.photo p
                       JOIN pipeline.photo_album pa ON pa.cloud_asset_id = p.cloud_asset_id
                      WHERE pa.album_path = a.path), '{}') AS file_names,
           (SELECT min(p.capture_date_local::date) FROM pipeline.photo p
              JOIN pipeline.photo_album pa ON pa.cloud_asset_id = p.cloud_asset_id
             WHERE pa.album_path = a.path AND p.arbitration_outcome = 'rejected') AS rejected_exif_from,
           (SELECT max(p.capture_date_local::date) FROM pipeline.photo p
              JOIN pipeline.photo_album pa ON pa.cloud_asset_id = p.cloud_asset_id
             WHERE pa.album_path = a.path AND p.arbitration_outcome = 'rejected') AS rejected_exif_to,
           (SELECT count(*)::int FROM pipeline.photo p
              JOIN pipeline.photo_album pa ON pa.cloud_asset_id = p.cloud_asset_id
             WHERE pa.album_path = a.path AND p.arbitration_outcome = 'rejected') AS rejected_exif_count
      FROM pipeline.album a
      LEFT JOIN ref.album_span rs ON rs.album_path = a.path`;

function mapAlbumRow(row: AlbumRow): Album {
  return {
    path: row.path,
    setName: row.set_name,
    albumName: row.album_name,
    groupName: row.group_name,
    photoCount: row.photo_count,
    prefixYear: row.prefix_year,
    prefixMonth: row.prefix_month,
    // Nullable en base (27 des 675 albums réels n'ont aucun préfixe exploitable),
    // mais jamais NULL dans le périmètre — vérifié — donc jamais ici.
    span: { from: row.span_from ?? '', to: row.span_to ?? '', presumed: row.span_presumed ?? true, note: row.note },
    suspectedRange: row.suspected_range,
    hints: {
      fileNamePatterns: extractFileNamePatterns(row.file_names),
      rejectedExifRange: row.rejected_exif_from === null || row.rejected_exif_to === null
        ? null : { from: row.rejected_exif_from, to: row.rejected_exif_to },
      rejectedExifCount: row.rejected_exif_count,
    },
  };
}

/**
 * `GET /albums` — le périmètre : « 82 albums, tout tient en une réponse »
 * (contrat §4.2). Filtré sur `in_perimeter` : les 593 autres (« all pics »,
 * dossiers `ToBeSorted`…) n'ont pas leur place ici — et c'est ce filtre qui
 * garantit que `span` n'est jamais NULL malgré la colonne nullable (27 des
 * 675 albums réels n'ont aucun préfixe exploitable, mais aucun n'est dans le
 * périmètre — vérifié).
 */
export async function listAlbums(client: PoolClient): Promise<Album[]> {
  const { rows } = await client.query<AlbumRow>(
    `${ALBUM_SELECT} WHERE a.in_perimeter ORDER BY a.suspected_range DESC, a.path`);
  return rows.map(mapAlbumRow);
}

async function getAlbum(client: PoolClient, albumPath: string): Promise<{ row: AlbumRow; album: Album } | null> {
  const { rows } = await client.query<AlbumRow>(
    `${ALBUM_SELECT} WHERE a.path = $1 AND a.in_perimeter`, [albumPath]);
  const row = rows[0];
  return row === undefined ? null : { row, album: mapAlbumRow(row) };
}

async function applyAlbumSpan(
  client: PoolClient, annotationsDir: string, albumPath: string, albumName: string, newInterval: AlbumInterval | null,
): Promise<AlbumSpanUpdateResult> {
  await client.query(
    `UPDATE pipeline.album SET span_from = $2, span_to = $3, span_presumed = $4 WHERE path = $1`,
    [albumPath, newInterval?.from ?? null, newInterval?.to ?? null, newInterval === null ? null : newInterval.presumed],
  );

  const recomputed = await recomputeAlbum(client, annotationsDir, albumPath, newInterval);
  const warnings = newInterval === null ? [] : await computeAlbumSpanWarnings(client, albumPath, albumName, newInterval);

  const updated = await getAlbum(client, albumPath);
  if (updated === null) {
    throw new Error(`album disparu pendant sa propre mise à jour : ${albumPath}`);
  }
  return { album: updated.album, recomputed, warnings };
}

export interface AlbumSpanInput {
  readonly albumPath: string;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly note: string | null;
}

/** `null` : l'album n'existe pas dans le périmètre (404). */
export async function putAlbumSpan(
  client: PoolClient, annotationsDir: string, input: AlbumSpanInput,
): Promise<AlbumSpanUpdateResult | null> {
  const found = await getAlbum(client, input.albumPath);
  if (found === null) return null;

  await client.query(
    `INSERT INTO ref.album_span (album_path, date_from, date_to, note, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (album_path) DO UPDATE
       SET date_from = EXCLUDED.date_from, date_to = EXCLUDED.date_to, note = EXCLUDED.note, updated_at = now()`,
    [input.albumPath, input.dateFrom, input.dateTo, input.note],
  );

  const newInterval = albumInterval(found.row.album_name, { from: input.dateFrom, to: input.dateTo });
  return await applyAlbumSpan(client, annotationsDir, input.albumPath, found.row.album_name, newInterval);
}

/**
 * `SystemStatus.attention.albumsWithPresumedSpan` (contrat §9) — les ~25
 * albums qu'une saisie de `ref.album_span` corrigerait. `pipeline.album.
 * span_presumed` est tenu à jour EN DIRECT par `applyAlbumSpan` à chaque
 * `PUT`/`DELETE /ref/album-span` (tâche 25) : jamais besoin de rejoindre
 * `ref.album_span` ici pour un état déjà propagé.
 */
export async function countAlbumsWithPresumedSpan(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pipeline.album WHERE in_perimeter AND span_presumed`);
  return rows[0]?.n ?? 0;
}

/** `null` : l'album n'existe pas dans le périmètre (404). Repasse en `presumed`, dérivé du préfixe. */
export async function deleteAlbumSpan(
  client: PoolClient, annotationsDir: string, albumPath: string,
): Promise<AlbumSpanUpdateResult | null> {
  const found = await getAlbum(client, albumPath);
  if (found === null) return null;

  await client.query(`DELETE FROM ref.album_span WHERE album_path = $1`, [albumPath]);

  const newInterval = albumInterval(found.row.album_name, null);
  return await applyAlbumSpan(client, annotationsDir, albumPath, found.row.album_name, newInterval);
}
