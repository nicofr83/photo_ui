import { createPool, type Pool, type PoolClient } from '../../src/db/pool.ts';

let pool: Pool | undefined;

export function testPool(): Pool {
  pool ??= createPool(process.env.DATABASE_URL_TEST!);
  return pool;
}

export async function closeTestPool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

/**
 * Chaque test dans une transaction ANNULÉE à la fin.
 *
 * Isolation parfaite, aucun `TRUNCATE` entre les tests, et une suite qui reste
 * rapide. Le corollaire est que le test doit tout faire à travers `client` :
 * une requête passée par le pool ouvrirait une autre connexion, qui ne verrait
 * rien de la transaction en cours.
 */
export async function withRollback(fn: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await testPool().connect();
  try {
    await client.query('BEGIN');
    await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}
