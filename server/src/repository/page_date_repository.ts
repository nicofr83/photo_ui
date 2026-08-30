import type { PoolClient } from '../db/pool.ts';
import { type PageInput, resolvePageDates } from '../metier/pages/page_date.ts';

interface PageDateSourceRow {
  page_id: string;
  document_id: string;
  ordinal: number;
  register_dates: string[];
  note_dates: string[];
}

/**
 * Recalcule `app.page_date` en entier — appelée en fin d'import
 * (`import_service.ts`) et après toute écriture qui l'invalide. `pipeline.*`
 * reste une copie fidèle de la pipeline amont ; cette table porte la
 * cascade de la 1.5, dérivée par `photo_ui`, jamais par elle.
 *
 * Le registre d'une page vient de ses `log_entry` (le document officiel) ;
 * ses notes libres viennent de ses `passage` — `ma-vie` n'a AUCUN
 * `log_entry`, donc ses pages n'ont jamais de `registerDates` et prennent
 * naturellement la branche « notes » de la cascade, sans cas particulier
 * dans le code. `resolvePageDates` (pure) tourne SÉPARÉMENT par document :
 * l'ordinal d'une page est relatif à SON document, jamais un ordre global.
 */
export async function recomputePageDates(client: PoolClient): Promise<number> {
  const { rows } = await client.query<PageDateSourceRow>(`
    SELECT p.id AS page_id, p.document_id, p.ordinal,
           coalesce(array_agg(DISTINCT t.date_start::text)
                      FILTER (WHERE t.kind = 'log_entry' AND t.date_start IS NOT NULL), '{}') AS register_dates,
           coalesce(array_agg(DISTINCT t.date_start::text)
                      FILTER (WHERE t.kind = 'passage' AND t.date_start IS NOT NULL), '{}') AS note_dates
      FROM pipeline.page p
      LEFT JOIN pipeline.text_unit t ON t.page_id = p.id
     GROUP BY p.id, p.document_id, p.ordinal`);

  const byDocument = new Map<string, PageInput[]>();
  for (const row of rows) {
    const pages = byDocument.get(row.document_id) ?? [];
    pages.push({
      pageId: row.page_id, ordinal: row.ordinal,
      registerDates: row.register_dates, noteDates: row.note_dates,
    });
    byDocument.set(row.document_id, pages);
  }

  const resolved = [...byDocument.values()].flatMap((pages) => resolvePageDates(pages));

  await client.query(`DELETE FROM app.page_date`);
  if (resolved.length > 0) {
    await client.query(
      `INSERT INTO app.page_date (page_id, date_start, date_end, source)
         SELECT * FROM unnest($1::text[], $2::date[], $3::date[], $4::text[])`,
      [
        resolved.map((r) => r.pageId), resolved.map((r) => r.start),
        resolved.map((r) => r.end), resolved.map((r) => r.source),
      ],
    );
  }
  return resolved.length;
}
