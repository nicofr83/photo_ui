import type { PoolClient } from '../db/pool.ts';
import type { TagKind } from '../metier/tags/classify_tag_name.ts';

export interface TagKindRow {
  readonly tagName: string;
  readonly kind: TagKind;
}

/**
 * `ON CONFLICT DO NOTHING` — jamais `DO UPDATE`. « Classée une fois et
 * corrigeable à la main » : une fois la ligne posée, qu'elle vienne de ce
 * classifieur ou d'une correction de Nicolas, une repasse ne doit plus la
 * toucher. Le classifieur est de toute façon déterministe ; ce que cette
 * garde protège, c'est la correction humaine.
 */
export async function writeTagKinds(client: PoolClient, rows: readonly TagKindRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  await client.query(
    `INSERT INTO ref.tag_kind (tag_name, kind)
       SELECT * FROM unnest($1::text[], $2::text[])
     ON CONFLICT (tag_name) DO NOTHING`,
    [rows.map((r) => r.tagName), rows.map((r) => r.kind)],
  );
  return rows.length;
}
