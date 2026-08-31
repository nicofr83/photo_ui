import type { PoolClient } from '../db/pool.ts';
import type { TextDateFacets } from '../contract/text_interface.ts';
import { bucketQuery } from './photo_repository.ts';

/**
 * « Ma vie » ne propose qu'une année et quatre mois, jamais les douze —
 * trois agrégats sur `pipeline.text_unit`, la date EFFECTIVE non nulle
 * (corrigée si corrigée, sinon lue — V1.6, `coalesce(c.corrected_date_start,
 * t.date_start)` : une facette qui continuerait à lire la date amont
 * mentirait sur ce que la correction a changé). `documentId` optionnel
 * EXACTEMENT comme `/texts` (aucun autre filtre : les facettes de date
 * répondent à « que contient cette source », pas « que reste-t-il sous le
 * filtre courant »).
 */
export async function getTextDateFacets(client: PoolClient, documentId?: string): Promise<TextDateFacets> {
  const effectiveDate = 'coalesce(c.corrected_date_start, t.date_start)';
  // `to_char`'s format is parameterized too ($1) even though it only ever
  // comes from the three literals below — never a string built by
  // interpolation, whatever the source.
  const whereClause = `WHERE ${effectiveDate} IS NOT NULL${documentId === undefined ? '' : ' AND t.document_id = $2'}`;
  const bucket = async (format: string): Promise<TextDateFacets['years']> => {
    const values: unknown[] = documentId === undefined ? [format] : [format, documentId];
    return bucketQuery(client, `
      SELECT to_char(${effectiveDate}, $1) AS value, count(*)::int AS count
        FROM pipeline.text_unit t
        LEFT JOIN app.text_correction c ON c.text_kind = t.kind AND c.text_id = t.id
        ${whereClause}
       GROUP BY 1
       ORDER BY 1`, values);
  };

  // SÉQUENTIEL, jamais `Promise.all` sur le même `PoolClient` (règle documentée dans `task_repository.ts`).
  const years = await bucket('YYYY');
  const months = await bucket('YYYY-MM');
  const days = await bucket('YYYY-MM-DD');
  return { years, months, days };
}
