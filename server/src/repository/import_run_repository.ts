import type { Pool, PoolClient } from '../db/pool.ts';

/**
 * L'import qui a produit les données actuellement en base — voyage dans
 * `ListEnvelope.importId` (contrat §9) : comparer le sien à celui reçu permet
 * au client de détecter qu'un import a tourné pendant sa session.
 */
export async function getLatestImportId(client: Pool | PoolClient): Promise<string | null> {
  const { rows } = await client.query<{ import_id: string }>(
    `SELECT import_id FROM pipeline.import_run
      WHERE status = 'succeeded' ORDER BY finished_at DESC LIMIT 1`);
  return rows[0]?.import_id ?? null;
}
