import type { PoolClient } from '../db/pool.ts';
import type { Album } from '../contract/photo_interface.ts';
import { extractFileNamePatterns } from '../metier/albums/file_name_patterns.ts';

interface AlbumRow {
  readonly path: string;
  readonly set_name: string | null;
  readonly album_name: string;
  readonly group_name: string | null;
  readonly photo_count: number;
  readonly prefix_year: number | null;
  readonly prefix_month: number | null;
  readonly span_from: string;
  readonly span_to: string;
  readonly span_presumed: boolean;
  readonly suspected_range: boolean;
  readonly note: string | null;
  readonly file_names: readonly string[];
  readonly rejected_exif_from: string | null;
  readonly rejected_exif_to: string | null;
  readonly rejected_exif_count: number;
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
  const { rows } = await client.query<AlbumRow>(`
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
      LEFT JOIN ref.album_span rs ON rs.album_path = a.path
     WHERE a.in_perimeter
     ORDER BY a.suspected_range DESC, a.path`);

  return rows.map((row): Album => ({
    path: row.path,
    setName: row.set_name,
    albumName: row.album_name,
    groupName: row.group_name,
    photoCount: row.photo_count,
    prefixYear: row.prefix_year,
    prefixMonth: row.prefix_month,
    span: { from: row.span_from, to: row.span_to, presumed: row.span_presumed, note: row.note },
    suspectedRange: row.suspected_range,
    hints: {
      fileNamePatterns: extractFileNamePatterns(row.file_names),
      rejectedExifRange: row.rejected_exif_from === null || row.rejected_exif_to === null
        ? null : { from: row.rejected_exif_from, to: row.rejected_exif_to },
      rejectedExifCount: row.rejected_exif_count,
    },
  }));
}
