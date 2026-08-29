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
 * @param trackingTable la table de suivi. Paramétrable pour que les tests DU
 *   LANCEUR n'aient pas à toucher `public.schema_migration`, qui est l'état
 *   partagé de toute la suite d'intégration : la vider ferait rejouer le schéma
 *   entier sous les pieds des autres fichiers de test.
 * @returns les versions appliquées PENDANT cet appel — vide si tout l'était.
 */
export const DEFAULT_TRACKING_TABLE = 'public.schema_migration';

export async function runMigrations(
  pool: Pool,
  log: Log,
  directory: string,
  trackingTable: string = DEFAULT_TRACKING_TABLE,
): Promise<string[]> {
  // Le nom de table ne peut pas être un paramètre lié ; il est donc validé
  // strictement plutôt qu'interpolé tel quel.
  if (!/^[a-z_]+\.[a-z_]+$/.test(trackingTable)) {
    throw new Error(`nom de table de suivi invalide : ${trackingTable}`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${trackingTable} (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();

  const { rows } = await pool.query<{ version: string }>(`SELECT version FROM ${trackingTable}`);
  const applied = new Set(rows.map((row) => row.version));

  const ran: string[] = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;

    const sql = await readFile(path.join(directory, file), 'utf8');
    await withTransaction(pool, async (client) => {
      await client.query(sql);
      await client.query(`INSERT INTO ${trackingTable} (version) VALUES ($1)`, [version]);
    });

    log.info('migration appliquée', { version });
    ran.push(version);
  }

  return ran;
}
