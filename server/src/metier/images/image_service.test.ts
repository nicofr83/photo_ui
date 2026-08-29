import { access, copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeEach, expect, test } from 'vitest';

import { createLog, LogLevel } from '../../log/log.ts';
import { must } from '../../../test/helpers/assert.ts';
import { createSafeFs, type SafeFs } from '../../io/safe_fs.ts';
import { getRender, getThumb, type ImageServiceDeps } from './image_service.ts';
import { InFlightRenders } from './in_flight_renders.ts';

const THUMBS_ROOT = '/Volumes/OWC Envoy Ultra/Pictures/lightroom/work/content-thumbs';
const A_SHA = 'b'.repeat(64);

let base: string;
let originalsRoot: string;
let renderCacheRoot: string;
let safeFs: SafeFs;
let deps: ImageServiceDeps;

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'image-service-'));
  originalsRoot = path.join(base, 'originals');
  renderCacheRoot = path.join(base, 'render-cache');
  await mkdir(originalsRoot);
  await mkdir(renderCacheRoot);
  safeFs = await createSafeFs([renderCacheRoot], createLog(LogLevel.ERROR, {}, () => undefined));
  deps = {
    thumbsRoot: THUMBS_ROOT,
    originalsRoot,
    renderCacheRoot,
    safeFs,
    inFlight: new InFlightRenders(8),
  };
});

async function realThumbSha(): Promise<string> {
  const [firstFile] = await readdir(THUMBS_ROOT);
  return path.basename(must(firstFile, 'THUMBS_ROOT est vide'), '.jpg');
}

test('getThumb serves a real, pre-generated thumbnail by its sha256 filename', async () => {
  const sha = await realThumbSha();
  const result = await getThumb(deps, sha, { relativePath: 'ignored', format: 'jpg' });
  expect(result.failure).toBeNull();
  expect(result.buffer?.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
});

test('getThumb — THUMBS_ROOT unmounted is VOLUME_UNAVAILABLE, never SOURCE_FILE_MISSING', async () => {
  const result = await getThumb(
    { ...deps, thumbsRoot: path.join(base, 'nowhere-mounted') },
    A_SHA, { relativePath: 'ignored', format: 'jpg' },
  );
  expect(result.failure).toBe('VOLUME_UNAVAILABLE');
  expect(result.buffer).toBeNull();
});

test('getThumb — root mounted but the sha has no thumbnail is SOURCE_FILE_MISSING', async () => {
  const result = await getThumb(deps, A_SHA, { relativePath: 'ignored', format: 'jpg' });
  expect(result.failure).toBe('SOURCE_FILE_MISSING');
});

test('getThumb — a video format is NOT_RENDERABLE even when the thumbnail file exists', async () => {
  const sha = await realThumbSha();
  const result = await getThumb(deps, sha, { relativePath: 'ignored', format: 'mov' });
  expect(result.failure).toBe('NOT_RENDERABLE');
});

test('getRender — ORIGINALS_ROOT unmounted is VOLUME_UNAVAILABLE', async () => {
  const result = await getRender(
    { ...deps, originalsRoot: path.join(base, 'nowhere-mounted') },
    A_SHA, { relativePath: 'x/p.jpg', format: 'jpg' }, 1400,
  );
  expect(result.failure).toBe('VOLUME_UNAVAILABLE');
});

test('getRender — a missing source file is SOURCE_FILE_MISSING', async () => {
  const result = await getRender(deps, A_SHA, { relativePath: 'nowhere/p.jpg', format: 'jpg' }, 1400);
  expect(result.failure).toBe('SOURCE_FILE_MISSING');
});

test('getRender — a video source is NOT_RENDERABLE, sips is never invoked', async () => {
  await mkdir(path.join(originalsRoot, 'x'));
  await writeFile(path.join(originalsRoot, 'x', 'p.mov'), '');
  const result = await getRender(deps, A_SHA, { relativePath: 'x/p.mov', format: 'mov' }, 1400);
  expect(result.failure).toBe('NOT_RENDERABLE');
});

test('getRender renders once, caches atomically, and a second call is served from cache', async () => {
  const sourceSha = await realThumbSha();
  await mkdir(path.join(originalsRoot, 'album'));
  const sourcePath = path.join(originalsRoot, 'album', 'p.jpg');
  await copyFile(path.join(THUMBS_ROOT, `${sourceSha}.jpg`), sourcePath);

  const first = await getRender(deps, A_SHA, { relativePath: 'album/p.jpg', format: 'jpg' }, 1400);
  expect(first.failure).toBeNull();
  expect(first.buffer?.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

  const cachedPath = path.join(renderCacheRoot, '1400', `${A_SHA}.jpg`);
  await expect(access(cachedPath)).resolves.toBeUndefined();
  // Écriture atomique : aucun fichier temporaire ne traîne après coup.
  expect(await readdir(path.join(renderCacheRoot, '1400'))).toEqual([`${A_SHA}.jpg`]);

  const onDisk = await readFile(cachedPath);
  const second = await getRender(deps, A_SHA, { relativePath: 'album/p.jpg', format: 'jpg' }, 1400);
  expect(second.buffer).toEqual(onDisk);
});

test('getRender — concurrent calls for the same key share one render (InFlightRenders wired in)', async () => {
  const sourceSha = await realThumbSha();
  await mkdir(path.join(originalsRoot, 'album'));
  const sourcePath = path.join(originalsRoot, 'album', 'p.jpg');
  await copyFile(path.join(THUMBS_ROOT, `${sourceSha}.jpg`), sourcePath);

  const photo = { relativePath: 'album/p.jpg', format: 'jpg' };
  const [a, b] = await Promise.all([
    getRender(deps, A_SHA, photo, 1400),
    getRender(deps, A_SHA, photo, 1400),
  ]);
  expect(a.buffer).toEqual(b.buffer);
});
