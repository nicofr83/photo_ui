import { copyFile, mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../../db/migrate.ts';
import { createLog, LogLevel } from '../../log/log.ts';
import { closeTestPool, testPool } from '../../../test/helpers/db.ts';
import { must } from '../../../test/helpers/assert.ts';
import { createSafeFs } from '../../io/safe_fs.ts';
import { InFlightRenders } from './in_flight_renders.ts';
import { runPrerender } from './prerender_service.ts';

const MIGRATIONS = fileURLToPath(new URL('../../../db/migrations', import.meta.url));
const THUMBS_ROOT = '/Volumes/OWC Envoy Ultra/Pictures/lightroom/work/content-thumbs';

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

test('renders every distinct sha256 in the perimeter once, reports progress and the final tally', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'prerender-'));
  const originalsRoot = path.join(base, 'originals');
  const renderCacheRoot = path.join(base, 'render-cache');
  await mkdir(originalsRoot);
  await mkdir(renderCacheRoot);
  const safeFs = await createSafeFs([renderCacheRoot], createLog(LogLevel.ERROR, {}, () => undefined));
  const imageService = {
    thumbsRoot: THUMBS_ROOT, originalsRoot, renderCacheRoot, safeFs, inFlight: new InFlightRenders(8),
  };

  const setup = testPool();
  const [sourceFile] = await readdir(THUMBS_ROOT);
  const sourceSha = path.basename(must(sourceFile, 'THUMBS_ROOT est vide'), '.jpg');
  const idA = 'a'.repeat(32);
  const idB = 'b'.repeat(32); // partage le même sha256 que idA — un seul rendu attendu pour les deux
  const idOutOfPerimeter = 'c'.repeat(32);
  await mkdir(path.join(originalsRoot, 'set'));
  await copyFile(path.join(THUMBS_ROOT, `${sourceSha}.jpg`), path.join(originalsRoot, 'set', 'p.jpg'));

  await setup.query(`INSERT INTO pipeline.album (path, album_name, in_perimeter, span_from, span_to, span_presumed)
                     VALUES ('set/x', 'x', true, '2000-01-01', '2000-12-31', true),
                            ('set/y', 'y', false, '2000-01-01', '2000-12-31', true)`);
  for (const [id, sha] of [[idA, sourceSha], [idB, sourceSha], [idOutOfPerimeter, 'f'.repeat(64)]] as const) {
    await setup.query(`INSERT INTO pipeline.photo (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
                       VALUES ($1, $2, 'set/p.jpg', 'p.jpg', 'jpg', 'none')`, [id, sha]);
  }
  await setup.query(`INSERT INTO pipeline.photo_album (cloud_asset_id, album_path, is_primary)
                     VALUES ($1, 'set/x', true), ($2, 'set/x', true), ($3, 'set/y', true)`,
    [idA, idB, idOutOfPerimeter]);

  const progressCalls: { done: number; total: number | null }[] = [];
  const signal = { cancelled: false };

  try {
    const result = await runPrerender(setup, imageService, 8,
      (done, total) => { progressCalls.push({ done, total }); }, signal);

    expect(result).toEqual({ type: 'prerender', rendered: 1, failed: 0 });
    expect(progressCalls[0]).toEqual({ done: 0, total: 1 });
    expect(progressCalls.at(-1)).toEqual({ done: 1, total: 1 });

    const cached = await readFile(path.join(renderCacheRoot, '1400', `${sourceSha}.jpg`));
    expect(cached.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  } finally {
    await setup.query(`DELETE FROM pipeline.photo_album WHERE album_path IN ('set/x', 'set/y')`);
    await setup.query(`DELETE FROM pipeline.photo WHERE cloud_asset_id = ANY($1)`, [[idA, idB, idOutOfPerimeter]]);
    await setup.query(`DELETE FROM pipeline.album WHERE path IN ('set/x', 'set/y')`);
  }
});

test('a cooperative cancel between renders stops further work', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'prerender-cancel-'));
  const originalsRoot = path.join(base, 'originals');
  const renderCacheRoot = path.join(base, 'render-cache');
  await mkdir(originalsRoot);
  await mkdir(renderCacheRoot);
  const safeFs = await createSafeFs([renderCacheRoot], createLog(LogLevel.ERROR, {}, () => undefined));
  const imageService = {
    thumbsRoot: THUMBS_ROOT, originalsRoot, renderCacheRoot, safeFs, inFlight: new InFlightRenders(1),
  };

  const setup = testPool();
  await setup.query(`INSERT INTO pipeline.album (path, album_name, in_perimeter, span_from, span_to, span_presumed)
                     VALUES ('set/z', 'z', true, '2000-01-01', '2000-12-31', true)`);
  const ids = Array.from({ length: 3 }, (_, i) => String(i).repeat(32));
  for (const [i, id] of ids.entries()) {
    await setup.query(`INSERT INTO pipeline.photo (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
                       VALUES ($1, $2, 'set/p.jpg', 'p.jpg', 'jpg', 'none')`, [id, String(i).repeat(64)]);
    await setup.query(`INSERT INTO pipeline.photo_album (cloud_asset_id, album_path, is_primary)
                       VALUES ($1, 'set/z', true)`, [id]);
  }

  const signal = { cancelled: true }; // annulé avant même de commencer
  try {
    const result = await runPrerender(setup, imageService, 1, () => undefined, signal);
    expect(result.rendered).toBe(0);
    expect(result.failed).toBe(0);
  } finally {
    await setup.query(`DELETE FROM pipeline.photo_album WHERE album_path = 'set/z'`);
    await setup.query(`DELETE FROM pipeline.photo WHERE cloud_asset_id = ANY($1)`, [ids]);
    await setup.query(`DELETE FROM pipeline.album WHERE path = 'set/z'`);
  }
});
