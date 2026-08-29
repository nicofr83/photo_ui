import type { PoolClient } from '../db/pool.ts';

export interface PrerenderSource {
  readonly sha256: string;
  readonly relativePath: string;
  readonly format: string;
}

/**
 * Un rendu par CONTENU, pas par photo : plusieurs `cloud_asset_id` partagent
 * parfois un `sha256` (949 groupes, §6.1) — `DISTINCT ON` en retient un
 * représentant, `getRender` (déjà keyée sur `sha256`) ferait de toute façon
 * le même travail en double sans lui.
 */
export async function listPerimeterRenderSources(client: PoolClient): Promise<readonly PrerenderSource[]> {
  const { rows } = await client.query<PrerenderSource>(`
    SELECT DISTINCT ON (p.sha256) p.sha256, p.relative_path AS "relativePath", p.format
      FROM pipeline.photo p
      JOIN pipeline.photo_album pa ON pa.cloud_asset_id = p.cloud_asset_id
      JOIN pipeline.album a ON a.path = pa.album_path AND a.in_perimeter
     ORDER BY p.sha256, p.cloud_asset_id`);
  return rows;
}
