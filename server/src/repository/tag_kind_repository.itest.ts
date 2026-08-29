import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { must } from '../../test/helpers/assert.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { writeTagKinds } from './tag_kind_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

test('writes a batch of classifications', async () => {
  await withRollback(async (client) => {
    const count = await writeTagKinds(client, [
      { tagName: 'italy', kind: 'place' }, { tagName: 'blue', kind: 'descriptive' },
    ]);
    expect(count).toBe(2);
    const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM ref.tag_kind');
    expect(must(rows[0]).n).toBe(2);
  });
});

test('NEVER overwrites an existing row — classified once, corrected by hand thereafter', async () => {
  await withRollback(async (client) => {
    await writeTagKinds(client, [{ tagName: 'nice', kind: 'unknown' }]);
    // Nicolas corrige à la main : c'est bien la ville, pas l'adjectif.
    await client.query(`UPDATE ref.tag_kind SET kind = 'place' WHERE tag_name = 'nice'`);

    await writeTagKinds(client, [{ tagName: 'nice', kind: 'unknown' }]);   // reclassification

    const { rows } = await client.query<{ kind: string }>(
      `SELECT kind FROM ref.tag_kind WHERE tag_name = 'nice'`);
    expect(must(rows[0]).kind).toBe('place');
  });
});

test('an empty batch writes nothing', async () => {
  await withRollback(async (client) => {
    expect(await writeTagKinds(client, [])).toBe(0);
  });
});
