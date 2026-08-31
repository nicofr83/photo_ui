import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool } from '../../test/helpers/db.ts';
import type { ListEnvelope } from '../contract/filter_interface.ts';
import type { PhotoListItem } from '../contract/photo_interface.ts';
import type { OverlapSummary, TextWithOverlap } from '../contract/text_interface.ts';
import { bootstrap, type App } from '../runtime/bootstrap.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

let app: App | undefined;

async function completeEnv(): Promise<NodeJS.ProcessEnv> {
  const base = await mkdtemp(path.join(tmpdir(), 'photos-controller-'));
  const dir = async (name: string): Promise<string> => {
    const p = path.join(base, name);
    await import('node:fs/promises').then((fs) => fs.mkdir(p));
    return p;
  };
  return {
    DATABASE_URL: process.env.DATABASE_URL_TEST,
    ORIGINALS_ROOT: await dir('originals'), THUMBS_ROOT: await dir('thumbs'),
    PIPELINE_DB_ROOT: await dir('pipeline-db'), PAGES_ROOT: await dir('pages'),
    ANNOTATIONS_DIR: await dir('annotations'), WEB_GALLERY_ROOT: await dir('web-gallery'), WEB_SITE_ROOT: await dir('web-site'),
    RENDER_CACHE_ROOT: await dir('render-cache'), TASKS_ROOT: await dir('tasks'),
  };
}

afterEach(async () => { await app?.close(); app = undefined; });

describe('GET /photos', () => {
  test('an unknown parameter is a named 400', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/photos?albumPaht=x' });
    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: { code: string; details: { parameters: string[] } } }>();
    expect(body.error.code).toBe('UNKNOWN_PARAMETER');
    expect(body.error.details.parameters).toEqual(['albumPaht']);
  });

  test('an invalid value in a closed vocabulary is a named 400', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/photos?scope=foo' });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('INVALID_PARAMETER');
  });

  test('overlapsTextKind without overlapsTextId is refused, naming which is missing', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/photos?overlapsTextKind=passage' });
    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: { details: { parameter: string } } }>();
    expect(body.error.details.parameter).toBe('overlapsTextId');
  });

  test('overlapsTextKind+overlapsTextId decorates each item with overlap AND the envelope with overlapSummary — front\'s exact repro', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    const id = 'a'.repeat(32);
    try {
      await setup.query(`INSERT INTO pipeline.photo
        (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
         resolved_from, resolved_start, resolved_end, resolved_precision)
        VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'exif', 'annotation', '2000-01-15', '2000-01-15', 'day')`,
        [id, 'b'.repeat(64)]);
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('doc', 'handwritten', 'Doc', false)`);
      await setup.query(`INSERT INTO pipeline.text_unit
        (kind, id, document_id, ordinal, body, confidence, covers_start, covers_end, covers_rule)
        VALUES ('passage', 'doc/p1', 'doc', 1, 'p1', 'transcribed', '2000-01-10', '2000-01-20', 'passage')`);

      const response = await app.server.inject({
        method: 'GET', url: '/photos?scope=all&overlapsTextKind=passage&overlapsTextId=doc%2Fp1',
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: { overlap?: unknown }[]; overlapSummary?: { matchCount: number } }>();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.overlap).toBeDefined();
      expect(body.overlapSummary).toBeDefined();
      expect(body.overlapSummary?.matchCount).toBe(1);
    } finally {
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'doc'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'doc'`);
      await setup.query('DELETE FROM pipeline.photo');
    }
  });

  test('a real request against an empty database returns a well-formed empty envelope', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/photos?scope=all' });
    expect(response.statusCode).toBe(200);
    const body = response.json<ListEnvelope<PhotoListItem>>();
    expect(body).toMatchObject({ items: [], total: 0, populationTotal: 0, excludedCount: 0 });
    expect(body.importId).toBe('');
  });

  test('a photo inserted directly is served through the full HTTP path, importId included', async () => {
    // La route interroge le POOL de bootstrap, une connexion DIFFÉRENTE de
    // celle d'un `withRollback` : les données doivent être réellement
    // commitées pour que la route les voie. Nettoyage explicite ensuite.
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.album (path, album_name, in_perimeter, span_from, span_to, span_presumed)
                         VALUES ('set/x', 'x', true, '2000-12-01', '2000-12-31', true)`);
      await setup.query(`INSERT INTO pipeline.photo
        (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source, album_path,
         resolved_from, resolved_start, resolved_end, resolved_precision)
        VALUES ($1, $2, 'set/x/p.jpg', 'p.jpg', 'jpg', 'folder-month', 'set/x',
                'album_month', '2000-12-01', '2000-12-31', 'month')`, ['a'.repeat(32), 'b'.repeat(64)]);
      await setup.query(`INSERT INTO pipeline.photo_album (cloud_asset_id, album_path, is_primary)
                         VALUES ($1, 'set/x', true)`, ['a'.repeat(32)]);
      await setup.query(`INSERT INTO pipeline.import_run (import_id, started_at, finished_at, status, sources)
                         VALUES ('01TESTIMPORT', now(), now(), 'succeeded', '{}')`);

      const response = await app.server.inject({ method: 'GET', url: '/photos?scope=all' });
      expect(response.statusCode).toBe(200);
      const body = response.json<ListEnvelope<PhotoListItem>>();
      expect(body.total).toBe(1);
      expect(body.importId).toBe('01TESTIMPORT');
      expect(body.items[0]?.cloudAssetId).toBe('a'.repeat(32));
    } finally {
      await setup.query('DELETE FROM pipeline.photo_album');
      await setup.query('DELETE FROM pipeline.photo');
      await setup.query('DELETE FROM pipeline.album');
      await setup.query('DELETE FROM pipeline.import_run');
    }
  });
});

describe('GET /photos/:cloudAssetId', () => {
  test('a malformed id is a 404, named, never a 500 from a bad query', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/photos/not-a-real-id' });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
  });

  test('a well-formed but unknown id is a 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: `/photos/${'f'.repeat(32)}` });
    expect(response.statusCode).toBe(404);
  });

  test('a real photo is served with render availability filled in', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.photo
        (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
        VALUES ($1, $2, 'nowhere/p.jpg', 'p.jpg', 'jpg', 'none')`, ['a'.repeat(32), 'b'.repeat(64)]);

      const response = await app.server.inject({ method: 'GET', url: `/photos/${'a'.repeat(32)}` });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ render: { available: boolean; unavailableReason: string | null } }>();
      // ORIGINALS_ROOT existe (répertoire temporaire vide) mais le fichier non :
      // SOURCE_FILE_MISSING, jamais VOLUME_UNAVAILABLE — la racine EST montée.
      expect(body.render).toEqual({ available: false, unavailableReason: 'SOURCE_FILE_MISSING', cached: false });
    } finally {
      await setup.query('DELETE FROM pipeline.photo');
    }
  });
});

describe('GET /photos/:cloudAssetId/texts', () => {
  test('a malformed id is a 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/photos/not-a-real-id/texts' });
    expect(response.statusCode).toBe(404);
  });

  test('an unknown but well-formed id is a 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: `/photos/${'f'.repeat(32)}/texts` });
    expect(response.statusCode).toBe(404);
  });

  test('a real overlap round-trips through the full HTTP path, with an OverlapSummary', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    const id = 'a'.repeat(32);
    try {
      await setup.query(`INSERT INTO pipeline.photo
        (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
         resolved_from, resolved_start, resolved_end, resolved_precision)
        VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'folder-month', 'album_month', '2000-06-01', '2000-06-01', 'day')`,
        [id, 'b'.repeat(64)]);
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('logbook', 'handwritten', 'Journal', true)`);
      await setup.query(`INSERT INTO pipeline.text_unit
        (kind, id, document_id, ordinal, body, confidence, covers_start, covers_end, covers_rule)
        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'x', 'transcribed', '2000-05-28', '2000-06-03', 'logbook_entry')`);

      const response = await app.server.inject({ method: 'GET', url: `/photos/${id}/texts` });
      expect(response.statusCode).toBe(200);
      const body = response.json<ListEnvelope<TextWithOverlap> & { overlapSummary: OverlapSummary }>();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.overlap.rule).toBe('logbook_entry');
      expect(body.overlapSummary.matchCount).toBe(1);
    } finally {
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
      await setup.query('DELETE FROM pipeline.photo');
    }
  });

  test('an UNDATED photo still surfaces a real gallery caption — identity, not a date overlap', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    const id = 'a'.repeat(32);
    try {
      await setup.query(`INSERT INTO pipeline.photo (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
        VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'none')`, [id, 'b'.repeat(64)]);
      await setup.query(`INSERT INTO app.web_gallery_link (sha256, page, image_path, caption, distance, margin, verified)
        VALUES ($1, '2003/gal.htm', 'p01.jpg', 'Le port au matin', 4, 8, null)`, ['b'.repeat(64)]);

      const response = await app.server.inject({ method: 'GET', url: `/photos/${id}/texts` });
      expect(response.statusCode).toBe(200);
      const body = response.json<ListEnvelope<TextWithOverlap> & { overlapSummary: OverlapSummary }>();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.overlap).toEqual({
        rule: 'gallery_match', photoSpanDays: 0, textSpanDays: 0, totalSpanDays: 0, distanceToCentreDays: 0,
      });
      expect(body.overlapSummary.matchCount).toBe(1);
    } finally {
      await setup.query(`DELETE FROM app.web_gallery_link WHERE sha256 = $1`, ['b'.repeat(64)]);
      await setup.query('DELETE FROM pipeline.photo');
    }
  });
});

describe('GET /photos/facets', () => {
  test('accepts the same allowlist as GET /photos — an unknown parameter is a named 400', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/photos/facets?albumPaht=x' });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('UNKNOWN_PARAMETER');
  });

  test('an empty database returns a well-formed empty facets object, never a 500', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/photos/facets?scope=all' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ albums: unknown[]; positionedCount: number }>();
    expect(body.albums).toEqual([]);
    expect(body.positionedCount).toBe(0);
  });

  test('recalculates against the SAME filter as GET /photos, through the full HTTP path', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.photo (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source, city)
                         VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'none', 'Sorel')`, ['a'.repeat(32), 'b'.repeat(64)]);
      await setup.query(`INSERT INTO pipeline.photo (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source, city)
                         VALUES ($1, $2, 'x/p2.jpg', 'p2.jpg', 'jpg', 'none', 'Belmopan')`, ['c'.repeat(32), 'd'.repeat(64)]);

      const response = await app.server.inject({ method: 'GET', url: '/photos/facets?scope=all&city=Sorel' });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ cities: { value: string; count: number }[] }>();
      expect(body.cities).toEqual([{ value: 'Sorel', count: 1 }]);
    } finally {
      await setup.query('DELETE FROM pipeline.photo');
    }
  });
});

describe('GET /albums', () => {
  test('serves the in-perimeter albums through the full HTTP path', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.album
        (path, album_name, in_perimeter, span_from, span_to, span_presumed)
        VALUES ('set/x', 'x', true, '2000-12-01', '2000-12-31', true)`);

      const response = await app.server.inject({ method: 'GET', url: '/albums' });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: { path: string }[] }>();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.path).toBe('set/x');
    } finally {
      await setup.query('DELETE FROM pipeline.album');
    }
  });
});
