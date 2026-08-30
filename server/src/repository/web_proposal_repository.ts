import type { PoolClient } from '../db/pool.ts';
import type { WebDateProposal } from '../contract/text_interface.ts';

interface WebProposalRow {
  document_id: string;
  date: string;
  photo_count: number;
  dated_to_day_count: number;
  span_days: number;
}

/**
 * La date proposée d'un document du site : la plus petite `resolved_start`
 * parmi les photos liées par appariement de galerie
 * (`app.web_gallery_link`), avec ce qui la soutient — jamais posée dans
 * `ref.web_span` (Task 5, amendement A9) : elle s'AFFICHE, elle ne se
 * SAISIT pas. Un document sans photo liée n'a simplement aucune entrée
 * dans la carte retournée — `listWebDocuments` (`text_repository.ts`) le
 * traduit en `proposal: null`, jamais une date inventée.
 *
 * Même stripping que `stripHtmlExtension` (`text_repository.ts`) sur
 * `web_gallery_link.page` pour retrouver le `document_id` — les deux
 * DOIVENT rester d'accord sur la même règle, `web/2003/2003_gal_15` ici et
 * là, jamais deux versions qui divergent sur une casse ou une extension.
 */
export async function listWebProposals(client: PoolClient): Promise<ReadonlyMap<string, WebDateProposal>> {
  const { rows } = await client.query<WebProposalRow>(`
    SELECT 'web/' || regexp_replace(l.page, '\\.html?$', '', 'i')       AS document_id,
           min(p.resolved_start)::text                                  AS date,
           count(*)::int                                                AS photo_count,
           count(*) FILTER (WHERE p.resolved_precision = 'day')::int    AS dated_to_day_count,
           (max(p.resolved_end) - min(p.resolved_start))::int           AS span_days
      FROM app.web_gallery_link l
      JOIN pipeline.photo p ON p.sha256 = l.sha256
     WHERE p.resolved_start IS NOT NULL
     GROUP BY 1`);

  return new Map(rows.map((row) => [row.document_id, {
    date: row.date, photoCount: row.photo_count,
    datedToDayCount: row.dated_to_day_count, spanDays: row.span_days,
  }]));
}
