import { afterAll, expect, test } from 'vitest';

import { createPool } from './pool.ts';
import { withTransaction } from './transaction.ts';

const pool = createPool(process.env.DATABASE_URL_TEST!);
afterAll(async () => { await pool.end(); });

test('commits when the callback returns', async () => {
  await withTransaction(pool, async (client) => {
    await client.query('CREATE TABLE public.t_commit (v int)');
    await client.query('INSERT INTO public.t_commit VALUES ($1)', [1]);
  });

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM public.t_commit');
  expect(rows[0].n).toBe(1);
  await pool.query('DROP TABLE public.t_commit');
});

test('rolls back and rethrows the ORIGINAL error when the callback throws', async () => {
  await pool.query('CREATE TABLE public.t_rollback (v int)');

  const boom = new Error('une règle métier a refusé');
  await expect(withTransaction(pool, async (client) => {
    await client.query('INSERT INTO public.t_rollback VALUES (1)');
    throw boom;
  })).rejects.toBe(boom);

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM public.t_rollback');
  expect(rows[0].n).toBe(0);
  await pool.query('DROP TABLE public.t_rollback');
});

test('releases the client back to the pool even after a failure', async () => {
  // Un client non relâché sur le chemin d'erreur épuise le pool après N échecs,
  // et le symptôme est un serveur qui se fige sans un mot. 30 > max (10).
  for (let attempt = 0; attempt < 30; attempt++) {
    await withTransaction(pool, async () => { throw new Error('boum'); })
      .catch(() => undefined);
  }

  const { rows } = await pool.query('SELECT 1 AS ok');
  expect(rows[0].ok).toBe(1);
});

test('releases the client even when the SQL itself is what failed', async () => {
  for (let attempt = 0; attempt < 30; attempt++) {
    await withTransaction(pool, async (client) => {
      await client.query('SELECT * FROM une_table_qui_nexiste_pas');
    }).catch(() => undefined);
  }

  const { rows } = await pool.query('SELECT 1 AS ok');
  expect(rows[0].ok).toBe(1);
});

test('a DATE comes back as a civil day string, never a zoned Date object', async () => {
  // Sans le parseur, node-postgres construit un Date dans le fuseau local et
  // une borne au 1er du mois recule d'un jour à l'ouest de Greenwich.
  const { rows } = await pool.query(`SELECT '2000-12-01'::date AS d`);
  expect(rows[0].d).toBe('2000-12-01');
});
