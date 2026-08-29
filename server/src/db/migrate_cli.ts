import { fileURLToPath } from 'node:url';

import { createLog } from '../log/log.ts';
import { loadConfig } from '../runtime/config.ts';
import { runMigrations } from './migrate.ts';
import { createPool } from './pool.ts';

/**
 * `npm run db:migrate`. Chemin d'amorçage : le service de log existe dès la
 * deuxième ligne, donc rien ici n'a besoin de `console.log`.
 */
const config = loadConfig(process.env);
const log = createLog(config.logLevel);
const pool = createPool(process.env.DATABASE_URL_MIGRATE ?? config.databaseUrl);
const directory = fileURLToPath(new URL('../../db/migrations', import.meta.url));

try {
  const applied = await runMigrations(pool, log, directory);
  log.info(
    applied.length === 0 ? 'schéma déjà à jour' : 'migrations appliquées',
    { count: applied.length, versions: applied },
  );
} finally {
  await pool.end();
}
