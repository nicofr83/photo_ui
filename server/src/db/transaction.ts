import type { Pool, PoolClient } from './pool.ts';

/**
 * LA frontière transactionnelle, et il n'y en a qu'une.
 *
 * Un `repository` n'ouvre jamais de transaction : il reçoit son client. Un
 * contrôleur non plus. Les erreurs REMONTENT jusqu'ici, puis rollback — aucun
 * `catch` intermédiaire ne les avale ; un `catch` n'existe que pour enrichir
 * puis relancer.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // Le ROLLBACK peut lui-même échouer si la connexion est morte. On avale
    // CETTE erreur-là seulement, pour ne pas masquer la cause d'origine.
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    // Sans ce `finally`, N échecs épuisent le pool et le serveur se fige.
    client.release();
  }
}
