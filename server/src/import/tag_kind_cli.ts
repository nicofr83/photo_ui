import { createLog } from '../log/log.ts';
import { loadConfig } from '../runtime/config.ts';
import { createPool } from '../db/pool.ts';
import { withTransaction } from '../db/transaction.ts';
import { classifyTagName } from '../metier/tags/classify_tag_name.ts';
import { writeTagKinds } from '../repository/tag_kind_repository.ts';

/**
 * `npm run tags:classify`. Batch occasionnel, comme `gallery:match` : ne
 * touche que `ref.tag_kind`, jamais `pipeline`. Classée une fois — les
 * lignes déjà posées, humaines ou non, ne sont jamais réécrites (voir
 * `writeTagKinds`).
 */
const config = loadConfig(process.env);
const log = createLog(config.logLevel);
const pool = createPool(config.databaseUrl);

try {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT DISTINCT name FROM pipeline.tag WHERE kind = 'ai'`);
  log.info('tags à classer', { count: rows.length });

  const classified = rows.map((r) => ({ tagName: r.name, kind: classifyTagName(r.name) }));
  const byKind = { place: 0, descriptive: 0, unknown: 0 };
  for (const c of classified) byKind[c.kind]++;

  const written = await withTransaction(pool, (client) => writeTagKinds(client, classified));
  log.info('classification écrite dans ref.tag_kind', { proposées: written, ...byKind });
} finally {
  await pool.end();
}
