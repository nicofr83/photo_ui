import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { must } from '../../test/helpers/assert.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { writeGalleryLinks } from './gallery_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

const link = (overrides: Partial<Parameters<typeof writeGalleryLinks>[1][number]> = {}) => ({
  sha256: 'a'.repeat(64), page: '2003/2003_gal_11.htm', imagePath: '2003_gal_11/Long Bogue-021.JPG',
  caption: 'devinez le menu ???', alt: null, distance: 0, margin: 12, ...overrides,
});

test('writes a batch of links', async () => {
  await withRollback(async (client) => {
    const count = await writeGalleryLinks(client, [link(), link({ sha256: 'b'.repeat(64) })]);
    expect(count).toBe(2);
    const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM app.web_gallery_link');
    expect(must(rows[0]).n).toBe(2);
  });
});

test('verified defaults to NULL — not yet reviewed by a human', async () => {
  await withRollback(async (client) => {
    await writeGalleryLinks(client, [link()]);
    const { rows } = await client.query<{ verified: boolean | null }>(
      'SELECT verified FROM app.web_gallery_link');
    expect(must(rows[0]).verified).toBeNull();
  });
});

test('re-running on the SAME (sha256, imagePath) updates the match, never duplicates the row', async () => {
  await withRollback(async (client) => {
    await writeGalleryLinks(client, [link({ distance: 3, margin: 5 })]);
    await writeGalleryLinks(client, [link({ distance: 1, margin: 9 })]);   // le hash a été recalculé

    const { rows } = await client.query<{ n: number; distance: number; margin: number }>(
      'SELECT count(*)::int AS n, distance, margin FROM app.web_gallery_link GROUP BY distance, margin');
    expect(rows).toHaveLength(1);
    expect(must(rows[0])).toMatchObject({ n: 1, distance: 1, margin: 9 });
  });
});

test('re-running NEVER resets a human verification — that would erase reviewing work', async () => {
  await withRollback(async (client) => {
    await writeGalleryLinks(client, [link()]);
    await client.query(`UPDATE app.web_gallery_link SET verified = true`);

    await writeGalleryLinks(client, [link({ distance: 2 })]);   // même couple, recalculé

    const { rows } = await client.query<{ verified: boolean | null; distance: number }>(
      'SELECT verified, distance FROM app.web_gallery_link');
    expect(must(rows[0]).verified).toBe(true);
    expect(must(rows[0]).distance).toBe(2);
  });
});

test('the same sha256 can link to several DIFFERENT gallery images', async () => {
  await withRollback(async (client) => {
    await writeGalleryLinks(client, [
      link({ imagePath: 'a.jpg' }),
      link({ imagePath: 'b.jpg' }),
    ]);
    const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM app.web_gallery_link');
    expect(must(rows[0]).n).toBe(2);
  });
});

test('an empty batch writes nothing and does not error', async () => {
  await withRollback(async (client) => {
    expect(await writeGalleryLinks(client, [])).toBe(0);
  });
});
