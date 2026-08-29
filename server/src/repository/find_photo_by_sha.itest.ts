import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { findPhotoBySha256 } from './photo_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

test('returns null for a sha256 that matches no photo, never throws', async () => {
  await withRollback(async (client) => {
    expect(await findPhotoBySha256(client, 'f'.repeat(64))).toBeNull();
  });
});

test('resolves the relativePath and format needed to render the ORIGINAL, keyed by content', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
      VALUES ($1, $2, 'set/x/p.jpg', 'p.jpg', 'jpg', 'none')`, ['a'.repeat(32), 'b'.repeat(64)]);

    const found = await findPhotoBySha256(client, 'b'.repeat(64));
    expect(found).toEqual({ cloudAssetId: 'a'.repeat(32), relativePath: 'set/x/p.jpg', format: 'jpg' });
  });
});

test('two photos sharing the same sha256 (a duplicate import) still resolve — any match renders the same bytes', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
      VALUES ($1, $3, 'set/x/p.jpg', 'p.jpg', 'jpg', 'none'),
             ($2, $3, 'set/y/p-copy.jpg', 'p-copy.jpg', 'jpg', 'none')`,
      ['a'.repeat(32), 'c'.repeat(32), 'b'.repeat(64)]);

    const found = await findPhotoBySha256(client, 'b'.repeat(64));
    expect(found?.format).toBe('jpg');
  });
});
