import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Log } from '../log/log.ts';
import type { Pool } from './pool.ts';
import { withTransaction } from './transaction.ts';

/**
 * Pas de framework de migration. Ce sont quelques fichiers, appliqués sur une
 * seule base, par un seul processus. La seule fonction utile — ne pas rejouer
 * ce qui est déjà appliqué — tient en vingt lignes, contre un vocabulaire à
 * apprendre.
 *
 * Chaque fichier est appliqué DANS SA PROPRE TRANSACTION, avec l'écriture de sa
 * version : une migration qui échoue à mi-parcours ne laisse rien derrière elle
 * et n'est pas marquée comme appliquée.
 *
 * @returns les versions appliquées PENDANT cet appel — vide si tout l'était.
 */
export async function runMigrations(pool: Pool, log: Log, directory: string): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migration (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();

  const { rows } = await pool.query<{ version: string }>(
    'SELECT version FROM public.schema_migration');
  const applied = new Set(rows.map((row) => row.version));

  const ran: string[] = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;

    const sql = await readFile(path.join(directory, file), 'utf8');
    await withTransaction(pool, async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO public.schema_migration (version) VALUES ($1)', [version]);
    });

    log.info('migration appliquée', { version });
    ran.push(version);
  }

  return ran;
}
