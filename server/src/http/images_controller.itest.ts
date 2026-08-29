import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool } from '../../test/helpers/db.ts';
import { must } from '../../test/helpers/assert.ts';
import { bootstrap, type App } from '../runtime/bootstrap.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));
const REAL_THUMBS_ROOT = '/Volumes/OWC Envoy Ultra/Pictures/lightroom/work/content-thumbs';

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

let app: App | undefined;
let base: string;

async function completeEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): Promise<NodeJS.ProcessEnv> {
  base = await mkdtemp(path.join(tmpdir(), 'images-controller-'));
  const dir = async (name: string): Promise<string> => {
    const p = path.join(base, name);
    await mkdir(p);
    return p;
  };
  return {
    DATABASE_URL: process.env.DATABASE_URL_TEST,
    ORIGINALS_ROOT: await dir('originals'), THUMBS_ROOT: REAL_THUMBS_ROOT,
    PIPELINE_DB_ROOT: await dir('pipeline-db'), PAGES_ROOT: await dir('pages'),
    ANNOTATIONS_DIR: await dir('annotations'), WEB_GALLERY_ROOT: await dir('web-gallery'),
    RENDER_CACHE_ROOT: await dir('render-cache'), TASKS_ROOT: await dir('tasks'),
    ...overrides,
  };
}

afterEach(async () => { await app?.close(); app = undefined; });

async function realThumbSha(): Promise<string> {
  const [firstFile] = await readdir(REAL_THUMBS_ROOT);
  return path.basename(must(firstFile, 'THUMBS_ROOT est vide'), '.jpg');
}

describe('GET /images/:sha256/thumb', () => {
  test('a malformed sha256 is a 404, never a 500 from a bad path', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/images/not-a-sha/thumb' });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
  });

  test('a well-formed sha256 matching no photo is a 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: `/images/${'f'.repeat(64)}/thumb` });
    expect(response.statusCode).toBe(404);
  });

  test('serves the real thumbnail bytes, with immutable cache headers and an ETag', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    const sha = await realThumbSha();
    try {
      await setup.query(`INSERT INTO pipeline.photo
        (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
        VALUES ($1, $2, 'set/x/p.jpg', 'p.jpg', 'jpg', 'none')`, ['a'.repeat(32), sha]);

      const response = await app.server.inject({ method: 'GET', url: `/images/${sha}/thumb` });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(response.headers.etag).toBe(`"${sha}"`);
      expect(response.rawPayload.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    } finally {
      await setup.query('DELETE FROM pipeline.photo');
    }
  });

  test('a photo whose thumbnail file is absent is 404 SOURCE_FILE_MISSING', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.photo
        (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
        VALUES ($1, $2, 'set/x/p.jpg', 'p.jpg', 'jpg', 'none')`, ['a'.repeat(32), 'b'.repeat(64)]);

      const response = await app.server.inject({ method: 'GET', url: `/images/${'b'.repeat(64)}/thumb` });
      expect(response.statusCode).toBe(404);
      const body = response.json<{ error: { code: string; details: { cloudAssetId: string } } }>();
      expect(body.error.code).toBe('SOURCE_FILE_MISSING');
      expect(body.error.details.cloudAssetId).toBe('a'.repeat(32));
    } finally {
      await setup.query('DELETE FROM pipeline.photo');
    }
  });

  test('THUMBS_ROOT unmounted is 503 VOLUME_UNAVAILABLE, naming the env var', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv({ THUMBS_ROOT: path.join(await mkdtemp(path.join(tmpdir(), 'gone-')), 'nowhere') }));
    try {
      await setup.query(`INSERT INTO pipeline.photo
        (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
        VALUES ($1, $2, 'set/x/p.jpg', 'p.jpg', 'jpg', 'none')`, ['a'.repeat(32), 'b'.repeat(64)]);

      const response = await app.server.inject({ method: 'GET', url: `/images/${'b'.repeat(64)}/thumb` });
      expect(response.statusCode).toBe(503);
      const body = response.json<{ error: { code: string; details: { envVar: string } } }>();
      expect(body.error.code).toBe('VOLUME_UNAVAILABLE');
      expect(body.error.details.envVar).toBe('THUMBS_ROOT');
    } finally {
      await setup.query('DELETE FROM pipeline.photo');
    }
  });
});

describe('GET /images/:sha256/render', () => {
  test('edge is a CLOSED vocabulary — 900 is a 400 listing what is accepted', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.photo
        (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
        VALUES ($1, $2, 'set/x/p.jpg', 'p.jpg', 'jpg', 'none')`, ['a'.repeat(32), 'b'.repeat(64)]);

      const response = await app.server.inject({ method: 'GET', url: `/images/${'b'.repeat(64)}/render?edge=900` });
      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: { code: string; details: { accepted: string[] } } }>();
      expect(body.error.code).toBe('INVALID_PARAMETER');
      expect(body.error.details.accepted).toEqual(['1400']);
    } finally {
      await setup.query('DELETE FROM pipeline.photo');
    }
  });

  test('a missing original is 404 SOURCE_FILE_MISSING with the expected path', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.photo
        (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
        VALUES ($1, $2, 'set/x/p.jpg', 'p.jpg', 'jpg', 'none')`, ['a'.repeat(32), 'b'.repeat(64)]);

      const response = await app.server.inject({ method: 'GET', url: `/images/${'b'.repeat(64)}/render?edge=1400` });
      expect(response.statusCode).toBe(404);
      const body = response.json<{ error: { code: string; details: { cloudAssetId: string; expectedPath: string } } }>();
      expect(body.error.code).toBe('SOURCE_FILE_MISSING');
      expect(body.error.details.cloudAssetId).toBe('a'.repeat(32));
      expect(body.error.details.expectedPath).toContain('set/x/p.jpg');
    } finally {
      await setup.query('DELETE FROM pipeline.photo');
    }
  });

  test('a video format is 415 NOT_RENDERABLE with the format named', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await mkdir(path.join(base, 'originals', 'set', 'x'), { recursive: true });
      await writeFile(path.join(base, 'originals', 'set', 'x', 'clip.mov'), '');
      await setup.query(`INSERT INTO pipeline.photo
        (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
        VALUES ($1, $2, 'set/x/clip.mov', 'clip.mov', 'mov', 'none')`, ['a'.repeat(32), 'b'.repeat(64)]);

      const response = await app.server.inject({ method: 'GET', url: `/images/${'b'.repeat(64)}/render?edge=1400` });
      expect(response.statusCode).toBe(415);
      const body = response.json<{ error: { code: string; details: { format: string } } }>();
      expect(body.error.code).toBe('NOT_RENDERABLE');
      expect(body.error.details.format).toBe('mov');
    } finally {
      await setup.query('DELETE FROM pipeline.photo');
    }
  });

  test('renders a real photo, caches it, and serves it with the edge-suffixed ETag', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    const sourceSha = await realThumbSha();
    try {
      await mkdir(path.join(base, 'originals', 'set', 'x'), { recursive: true });
      const { copyFile } = await import('node:fs/promises');
      await copyFile(
        path.join(REAL_THUMBS_ROOT, `${sourceSha}.jpg`),
        path.join(base, 'originals', 'set', 'x', 'p.jpg'),
      );
      await setup.query(`INSERT INTO pipeline.photo
        (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
        VALUES ($1, $2, 'set/x/p.jpg', 'p.jpg', 'jpg', 'none')`, ['a'.repeat(32), 'b'.repeat(64)]);

      const response = await app.server.inject({ method: 'GET', url: `/images/${'b'.repeat(64)}/render?edge=1400` });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.headers.etag).toBe(`"${'b'.repeat(64)}-1400"`);
      expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(response.rawPayload.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    } finally {
      await setup.query('DELETE FROM pipeline.photo');
    }
  });
});
