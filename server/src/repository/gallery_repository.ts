import type { PoolClient } from '../db/pool.ts';

export interface GalleryLinkRow {
  readonly sha256: string;
  readonly page: string;
  readonly imagePath: string;
  readonly caption: string | null;
  readonly alt: string | null;
  readonly distance: number;
  readonly margin: number;
}

/**
 * `INSERT … ON CONFLICT (sha256, image_path) DO UPDATE`, mais SANS toucher
 * `verified` : c'est de la relecture humaine, et un recalcul de hash ne doit
 * jamais l'effacer — même principe que `photo_caption.edited_caption`, qui
 * ne se réécrit jamais depuis une repasse machine.
 */
export async function writeGalleryLinks(
  client: PoolClient,
  links: readonly GalleryLinkRow[],
): Promise<number> {
  if (links.length === 0) return 0;

  await client.query(
    `INSERT INTO app.web_gallery_link (sha256, page, image_path, caption, alt, distance, margin)
       SELECT * FROM unnest($1::char(64)[], $2::text[], $3::text[], $4::text[], $5::text[],
                             $6::int[], $7::int[])
     ON CONFLICT (sha256, image_path) DO UPDATE SET
       page = EXCLUDED.page, caption = EXCLUDED.caption, alt = EXCLUDED.alt,
       distance = EXCLUDED.distance, margin = EXCLUDED.margin`,
    [
      links.map((l) => l.sha256), links.map((l) => l.page), links.map((l) => l.imagePath),
      links.map((l) => l.caption), links.map((l) => l.alt),
      links.map((l) => l.distance), links.map((l) => l.margin),
    ],
  );
  return links.length;
}
