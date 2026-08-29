import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import type { PoolClient } from '../db/pool.ts';
import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { must } from '../../test/helpers/assert.ts';
import { listFacets } from './photo_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

async function insertPhoto(
  client: PoolClient, id: string, opts: {
    readonly city?: string; readonly country?: string; readonly position?: boolean; readonly ocr?: boolean;
    readonly precision?: string; readonly year?: string;
  } = {},
): Promise<void> {
  const year = opts.year ?? '2000';
  await client.query(`INSERT INTO pipeline.photo
    (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source, city, country_raw,
     position, ocr_text, resolved_from, resolved_start, resolved_end, resolved_precision)
    VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'folder-month', $3, $4,
            $5, $6, 'album_month', $7, $8, $9)`,
    [
      id, id.padEnd(64, '0'), opts.city ?? null, opts.country ?? null,
      opts.position === true ? 'SRID=4326;POINT(0 0)' : null, opts.ocr === true ? 'du texte' : null,
      `${year}-06-01`, `${year}-06-30`, opts.precision ?? 'month',
    ]);
}

test('albums/tags/people facets are counted against the SAME filter as GET /photos', async () => {
  await withRollback(async (client) => {
    const a = 'a'.repeat(32);
    const b = 'b'.repeat(32);
    await client.query(`INSERT INTO pipeline.album (path, album_name, in_perimeter, span_from, span_to, span_presumed)
                        VALUES ('set/x', 'x', true, '2000-01-01', '2000-12-31', true)`);
    await insertPhoto(client, a);
    await insertPhoto(client, b);
    await client.query(`INSERT INTO pipeline.photo_album (cloud_asset_id, album_path, is_primary)
                        VALUES ($1, 'set/x', true), ($2, 'set/x', true)`, [a, b]);
    await client.query(`INSERT INTO pipeline.tag (name, kind) VALUES ('ruins', 'ai')`);
    await client.query(`INSERT INTO pipeline.photo_tag (cloud_asset_id, tag_name, tag_kind)
                        VALUES ($1, 'ruins', 'ai')`, [a]);

    const facets = await listFacets(client, { scope: 'all' });
    expect(facets.albums).toContainEqual({ value: 'set/x', count: 2 });
    expect(facets.tags).toContainEqual({ value: 'ruins', count: 1 });
  });
});

test('a tag beyond the threshold is marked tooBroad, sorted ascending by count otherwise', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.tag (name, kind) VALUES ('rare', 'ai'), ('broad', 'ai')`);
    const ids = Array.from({ length: 501 }, (_, i) => `a${String(i).padStart(31, '0')}`);
    for (const id of ids) await insertPhoto(client, id);
    const rareId = 'b'.repeat(32);
    await insertPhoto(client, rareId);

    for (const id of ids) {
      await client.query(`INSERT INTO pipeline.photo_tag (cloud_asset_id, tag_name, tag_kind) VALUES ($1, 'broad', 'ai')`, [id]);
    }
    await client.query(`INSERT INTO pipeline.photo_tag (cloud_asset_id, tag_name, tag_kind) VALUES ($1, 'rare', 'ai')`, [rareId]);

    const facets = await listFacets(client, { scope: 'all' });
    const broad = must(facets.tags.find((t) => t.value === 'broad'), 'bucket "broad" manquant');
    const rare = must(facets.tags.find((t) => t.value === 'rare'), 'bucket "rare" manquant');
    expect(broad.tooBroad).toBe(true);
    expect(rare.tooBroad).toBeUndefined();
    expect(facets.tags.indexOf(rare)).toBeLessThan(facets.tags.indexOf(broad));
  });
});

test('positionedCount is 0 when nothing in the filtered set has a position — the place axis disables', async () => {
  await withRollback(async (client) => {
    await insertPhoto(client, 'a'.repeat(32));
    const facets = await listFacets(client, { scope: 'all' });
    expect(facets.positionedCount).toBe(0);
  });
});

test('positionedCount, withOcrCount and datedToDayCount are counted against the filtered set', async () => {
  await withRollback(async (client) => {
    await insertPhoto(client, 'a'.repeat(32), { position: true, ocr: true, precision: 'day' });
    await insertPhoto(client, 'b'.repeat(32));
    const facets = await listFacets(client, { scope: 'all' });
    expect(facets.positionedCount).toBe(1);
    expect(facets.withOcrCount).toBe(1);
    expect(facets.datedToDayCount).toBe(1);
  });
});

test('countries/cities exclude NULL, never a bucket for "unknown"', async () => {
  await withRollback(async (client) => {
    await insertPhoto(client, 'a'.repeat(32), { city: 'Sorel', country: 'Belize' });
    await insertPhoto(client, 'b'.repeat(32)); // ni ville, ni pays

    const facets = await listFacets(client, { scope: 'all' });
    expect(facets.cities).toEqual([{ value: 'Sorel', count: 1 }]);
    expect(facets.countries).toEqual([{ value: 'Belize', count: 1 }]);
  });
});

test('years excludes an undated photo, never a bucket for "unknown"', async () => {
  await withRollback(async (client) => {
    const dated = 'a'.repeat(32);
    const undated = 'b'.repeat(32);
    await insertPhoto(client, dated, { year: '1999' });
    await client.query(`INSERT INTO pipeline.photo (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
                        VALUES ($1, $2, 'x/p2.jpg', 'p2.jpg', 'jpg', 'none')`, [undated, undated.padEnd(64, '1')]);

    const facets = await listFacets(client, { scope: 'all' });
    expect(facets.years).toEqual([{ value: '1999', count: 1 }]);
  });
});

test('facets are recalculated against the SAME filter, not the whole population', async () => {
  await withRollback(async (client) => {
    await insertPhoto(client, 'a'.repeat(32), { city: 'Sorel' });
    await insertPhoto(client, 'b'.repeat(32), { city: 'Belmopan' });

    const facets = await listFacets(client, { scope: 'all', city: ['Sorel'] });
    expect(facets.cities).toEqual([{ value: 'Sorel', count: 1 }]);
  });
});
