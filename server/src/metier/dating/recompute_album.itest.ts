import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, afterAll, expect, test } from 'vitest';

import { runMigrations } from '../../db/migrate.ts';
import { createLog, LogLevel } from '../../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../../test/helpers/db.ts';
import { albumInterval, type AlbumInterval } from './album_span.ts';
import { computeAlbumSpanWarnings, recomputeAlbum } from './recompute_album.ts';

const MIGRATIONS = fileURLToPath(new URL('../../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

/** `albumInterval` rend `null` seulement quand le nom n'a aucun préfixe — les noms de test en portent toujours un. */
function mustInterval(interval: AlbumInterval | null): AlbumInterval {
  if (interval === null) throw new Error('interval attendu, absent');
  return interval;
}

async function emptyAnnotationsDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'annotations-'));
  await writeFile(path.join(dir, 'annotations.jsonl'), '');
  return dir;
}

test('an empty album has nothing to recompute', async () => {
  await withRollback(async (client) => {
    const dir = await emptyAnnotationsDir();
    const result = await recomputeAlbum(client, dir, 'set/nowhere', null);
    expect(result).toEqual({ photosAffected: 0, datesChanged: 0, precisionChanged: 0 });
  });
});

test('a photo dated purely by its album picks up the NEW interval, counted as changed', async () => {
  await withRollback(async (client) => {
    const dir = await emptyAnnotationsDir();
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.album (path, album_name, in_perimeter, span_from, span_to, span_presumed)
                        VALUES ('set/x', '1999-01 x', true, '1999-01-01', '1999-01-31', true)`);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'set/x/p.jpg', 'p.jpg', 'jpg', 'folder-month',
              'album_month', '1999-01-01', '1999-01-31', 'month')`, [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.photo_album (cloud_asset_id, album_path, is_primary)
                        VALUES ($1, 'set/x', true)`, [id]);

    const newInterval = albumInterval('1999-01 x', { from: '1999-06-10', to: '1999-06-10' });
    const result = await recomputeAlbum(client, dir, 'set/x', newInterval);

    expect(result).toEqual({ photosAffected: 1, datesChanged: 1, precisionChanged: 1 });
    const { rows } = await client.query<{ resolved_start: string; resolved_precision: string }>(
      `SELECT resolved_start, resolved_precision FROM pipeline.photo WHERE cloud_asset_id = $1`, [id]);
    expect(rows[0]?.resolved_start).toBe('1999-06-10');
    expect(rows[0]?.resolved_precision).toBe('day');
  });
});

test('a photo with an ANNOTATION is untouched by the album interval change — rank 1 primes without condition', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    const dir = await mkdtemp(path.join(tmpdir(), 'annotations-'));
    await writeFile(path.join(dir, 'annotations.jsonl'), `${JSON.stringify({
      at: '2020-01-01T00:00:00Z', kind: 'dating', target: { type: 'photo', id }, value: { date: '1999-12-25' },
    })}\n`);

    await client.query(`INSERT INTO pipeline.album (path, album_name, in_perimeter, span_from, span_to, span_presumed)
                        VALUES ('set/x', '1999-01 x', true, '1999-01-01', '1999-01-31', true)`);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'set/x/p.jpg', 'p.jpg', 'jpg', 'folder-month',
              'annotation', '1999-12-25', '1999-12-25', 'day')`, [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.photo_album (cloud_asset_id, album_path, is_primary)
                        VALUES ($1, 'set/x', true)`, [id]);

    const newInterval = albumInterval('1999-01 x', { from: '1999-06-10', to: '1999-06-10' });
    const result = await recomputeAlbum(client, dir, 'set/x', newInterval);

    expect(result).toEqual({ photosAffected: 1, datesChanged: 0, precisionChanged: 0 });
    const { rows } = await client.query<{ resolved_start: string; resolved_from: string }>(
      `SELECT resolved_start, resolved_from FROM pipeline.photo WHERE cloud_asset_id = $1`, [id]);
    expect(rows[0]?.resolved_start).toBe('1999-12-25');
    expect(rows[0]?.resolved_from).toBe('annotation');
  });
});

test('DELETE (interval null) falls back to undated for a photo with no other source', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    const dir = await emptyAnnotationsDir();
    await client.query(`INSERT INTO pipeline.album (path, album_name, in_perimeter, span_from, span_to, span_presumed)
                        VALUES ('set/x', 'sans prefixe exploitable', true, '1999-01-01', '1999-01-31', false)`);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'set/x/p.jpg', 'p.jpg', 'jpg', 'folder-month',
              'album_month', '1999-01-01', '1999-01-31', 'month')`, [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.photo_album (cloud_asset_id, album_path, is_primary)
                        VALUES ($1, 'set/x', true)`, [id]);

    const result = await recomputeAlbum(client, dir, 'set/x', null);
    expect(result).toEqual({ photosAffected: 1, datesChanged: 1, precisionChanged: 1 });
    const { rows } = await client.query<{ resolved_from: string | null }>(
      `SELECT resolved_from FROM pipeline.photo WHERE cloud_asset_id = $1`, [id]);
    expect(rows[0]?.resolved_from).toBeNull();
  });
});

test('outside_prefix_year — accepted with a warning when the interval extends beyond the prefix year', async () => {
  await withRollback(async (client) => {
    const interval = mustInterval(albumInterval('1998-02 x', { from: '1998-02-01', to: '1999-06-30' }));
    const warnings = await computeAlbumSpanWarnings(client, 'set/x', '1998-02 x', interval);
    expect(warnings).toContainEqual({ code: 'outside_prefix_year', prefixYear: 1998 });
  });
});

test('no outside_prefix_year warning when the interval is fully contained in the prefix year', async () => {
  await withRollback(async (client) => {
    const interval = mustInterval(albumInterval('1999-06 x', { from: '1999-06-01', to: '1999-06-30' }));
    const warnings = await computeAlbumSpanWarnings(client, 'set/x', '1999-06 x', interval);
    expect(warnings.some((w) => w.code === 'outside_prefix_year')).toBe(false);
  });
});

test('overlaps_album — one warning per OTHER album whose current span overlaps', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.album (path, album_name, in_perimeter, span_from, span_to, span_presumed)
      VALUES ('set/other', 'other', true, '1999-06-01', '1999-06-30', true),
             ('set/self', '1999-06 self', true, '2000-01-01', '2000-01-31', true)`);

    const interval = mustInterval(albumInterval('1999-06 self', { from: '1999-06-15', to: '1999-06-20' }));
    const warnings = await computeAlbumSpanWarnings(client, 'set/self', '1999-06 self', interval);
    expect(warnings).toContainEqual({ code: 'overlaps_album', albumPath: 'set/other' });
  });
});

test('an album never warns overlapsAlbum against itself', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.album (path, album_name, in_perimeter, span_from, span_to, span_presumed)
      VALUES ('set/self', '1999-06 self', true, '1999-06-01', '1999-06-30', true)`);

    const interval = mustInterval(albumInterval('1999-06 self', { from: '1999-06-01', to: '1999-06-30' }));
    const warnings = await computeAlbumSpanWarnings(client, 'set/self', '1999-06 self', interval);
    expect(warnings.some((w) => w.code === 'overlaps_album')).toBe(false);
  });
});
