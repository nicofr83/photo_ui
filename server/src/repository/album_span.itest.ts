import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { deleteAlbumSpan, putAlbumSpan } from './album_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

async function emptyAnnotationsDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'annotations-'));
  await writeFile(path.join(dir, 'annotations.jsonl'), '');
  return dir;
}

test('putAlbumSpan returns null for an unknown album', async () => {
  await withRollback(async (client) => {
    const dir = await emptyAnnotationsDir();
    const result = await putAlbumSpan(client, dir, {
      albumPath: 'set/nowhere', dateFrom: '1999-01-01', dateTo: '1999-01-31', note: null,
    });
    expect(result).toBeNull();
  });
});

test('putAlbumSpan returns null for an out-of-perimeter album', async () => {
  await withRollback(async (client) => {
    const dir = await emptyAnnotationsDir();
    await client.query(`INSERT INTO pipeline.album (path, album_name, in_perimeter, span_from, span_to, span_presumed)
                        VALUES ('set/x', 'x', false, '1999-01-01', '1999-01-31', true)`);
    const result = await putAlbumSpan(client, dir, {
      albumPath: 'set/x', dateFrom: '1999-01-01', dateTo: '1999-01-31', note: null,
    });
    expect(result).toBeNull();
  });
});

test('a saisie recomputes the album, returns the updated Album and real stats', async () => {
  await withRollback(async (client) => {
    const dir = await emptyAnnotationsDir();
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.album
      (path, album_name, in_perimeter, span_from, span_to, span_presumed)
      VALUES ('set/x', '1999-01 x', true, '1999-01-01', '1999-01-31', true)`);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'set/x/p.jpg', 'p.jpg', 'jpg', 'folder-month',
              'album_month', '1999-01-01', '1999-01-31', 'month')`, [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.photo_album (cloud_asset_id, album_path, is_primary)
                        VALUES ($1, 'set/x', true)`, [id]);

    const result = await putAlbumSpan(client, dir, {
      albumPath: 'set/x', dateFrom: '1999-06-10', dateTo: '1999-06-10', note: 'saisi à la main',
    });

    expect(result?.album.span).toEqual({ from: '1999-06-10', to: '1999-06-10', presumed: false, note: 'saisi à la main' });
    expect(result?.recomputed).toEqual({ photosAffected: 1, datesChanged: 1, precisionChanged: 1 });
    expect(result?.warnings).toEqual([]);
  });
});

test('outside_prefix_year travels as a warning, never a refusal', async () => {
  await withRollback(async (client) => {
    const dir = await emptyAnnotationsDir();
    await client.query(`INSERT INTO pipeline.album
      (path, album_name, in_perimeter, span_from, span_to, span_presumed)
      VALUES ('set/x', '1998-02 Maison rose Alges', true, '1998-02-01', '1998-02-28', true)`);

    const result = await putAlbumSpan(client, dir, {
      albumPath: 'set/x', dateFrom: '1998-02-01', dateTo: '1999-06-30', note: null,
    });
    expect(result?.warnings).toContainEqual({ code: 'outside_prefix_year', prefixYear: 1998 });
  });
});

test('DELETE restores presumed, derived from the prefix, and recomputes again', async () => {
  await withRollback(async (client) => {
    const dir = await emptyAnnotationsDir();
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.album
      (path, album_name, in_perimeter, span_from, span_to, span_presumed)
      VALUES ('set/x', '1999-06 x', true, '1999-01-01', '1999-01-31', true)`);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'set/x/p.jpg', 'p.jpg', 'jpg', 'folder-month',
              'album_month', '1999-01-01', '1999-01-31', 'month')`, [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.photo_album (cloud_asset_id, album_path, is_primary)
                        VALUES ($1, 'set/x', true)`, [id]);
    await putAlbumSpan(client, dir, { albumPath: 'set/x', dateFrom: '1999-06-10', dateTo: '1999-06-10', note: null });

    const result = await deleteAlbumSpan(client, dir, 'set/x');
    expect(result?.album.span.presumed).toBe(true);
    // Dérivé du préfixe `1999-06` : le mois entier, présumé.
    expect(result?.album.span).toEqual({ from: '1999-06-01', to: '1999-06-30', presumed: true, note: null });
    expect(result?.recomputed.photosAffected).toBe(1);
  });
});

test('deleteAlbumSpan returns null for an unknown album', async () => {
  await withRollback(async (client) => {
    const dir = await emptyAnnotationsDir();
    expect(await deleteAlbumSpan(client, dir, 'set/nowhere')).toBeNull();
  });
});
