import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { listAlbums } from './album_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

test('lists only in-perimeter albums, suspected-range first', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.album
      (path, album_name, in_perimeter, suspected_range, span_from, span_to, span_presumed)
      VALUES ('set/ordinary', 'x', true, false, '2000-12-01', '2000-12-31', true)`);
    await client.query(`INSERT INTO pipeline.album
      (path, album_name, in_perimeter, suspected_range, span_from, span_to, span_presumed)
      VALUES ('set/suspected', 'y-trip', true, true, '2000-01-01', '2000-06-30', true)`);
    await client.query(`INSERT INTO pipeline.album
      (path, album_name, in_perimeter, span_from, span_to, span_presumed)
      VALUES ('set/out-of-scope', 'z', false, '2020-01-01', '2020-01-31', true)`);

    const albums = await listAlbums(client);
    expect(albums).toHaveLength(2);
    expect(albums[0]?.path).toBe('set/suspected');
    expect(albums[0]?.suspectedRange).toBe(true);
    expect(albums[0]?.span.presumed).toBe(true);
    expect(albums[0]?.hints).toHaveProperty('fileNamePatterns');
  });
});

test('a ref.album_span note travels through, from a DIFFERENT table than the resolved span itself', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.album
      (path, album_name, in_perimeter, span_from, span_to, span_presumed)
      VALUES ('set/noted', 'x', true, '1998-02-01', '1999-06-30', false)`);
    await client.query(`INSERT INTO ref.album_span (album_path, date_from, date_to, note)
      VALUES ('set/noted', '1998-02-01', '1999-06-30', 'saisi à la main, plusieurs séjours')`);

    const [album] = await listAlbums(client);
    expect(album?.span).toEqual({
      from: '1998-02-01', to: '1999-06-30', presumed: false, note: 'saisi à la main, plusieurs séjours',
    });
  });
});

test('rejectedExifRange/Count aggregate the rejected-arbitration photos of this album only', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.album
      (path, album_name, in_perimeter, span_from, span_to, span_presumed)
      VALUES ('set/scanned', 'x', true, '2000-12-01', '2000-12-31', true)`);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision,
       capture_date_local, arbitration_outcome, arbitration_gap_months)
      VALUES ($1, $2, 'x', 'x.jpg', 'jpg', 'capture-date',
              'album_month', '2000-12-01', '2000-12-31', 'month',
              '2017-04-11T09:15:00', 'rejected', 196)`, ['a'.repeat(32), 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.photo_album (cloud_asset_id, album_path, is_primary)
                        VALUES ($1, 'set/scanned', true)`, ['a'.repeat(32)]);

    const [album] = await listAlbums(client);
    expect(album?.hints.rejectedExifCount).toBe(1);
    expect(album?.hints.rejectedExifRange).toEqual({ from: '2017-04-11', to: '2017-04-11' });
  });
});

test('an album with no rejected EXIF at all reports null, never a zero-width fake range', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.album
      (path, album_name, in_perimeter, span_from, span_to, span_presumed)
      VALUES ('set/clean', 'x', true, '2000-12-01', '2000-12-31', true)`);

    const [album] = await listAlbums(client);
    expect(album?.hints.rejectedExifRange).toBeNull();
    expect(album?.hints.rejectedExifCount).toBe(0);
  });
});

test('empty scope yields an empty array, not an error', async () => {
  await withRollback(async (client) => {
    expect(await listAlbums(client)).toEqual([]);
  });
});
