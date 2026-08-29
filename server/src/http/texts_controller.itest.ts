import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool } from '../../test/helpers/db.ts';
import type { ListEnvelope } from '../contract/filter_interface.ts';
import type { TextDocument, TextPage, TextUnit } from '../contract/text_interface.ts';
import { bootstrap, type App } from '../runtime/bootstrap.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

let app: App | undefined;
let pagesRoot = '';

async function completeEnv(): Promise<NodeJS.ProcessEnv> {
  const base = await mkdtemp(path.join(tmpdir(), 'texts-controller-'));
  const dir = async (name: string): Promise<string> => {
    const p = path.join(base, name);
    await mkdir(p);
    return p;
  };
  pagesRoot = await dir('pages');
  return {
    DATABASE_URL: process.env.DATABASE_URL_TEST,
    ORIGINALS_ROOT: await dir('originals'), THUMBS_ROOT: await dir('thumbs'),
    PIPELINE_DB_ROOT: await dir('pipeline-db'), PAGES_ROOT: pagesRoot,
    ANNOTATIONS_DIR: await dir('annotations'), WEB_GALLERY_ROOT: await dir('web-gallery'),
    RENDER_CACHE_ROOT: await dir('render-cache'), TASKS_ROOT: await dir('tasks'),
  };
}

afterEach(async () => { await app?.close(); app = undefined; });

describe('GET /documents', () => {
  test('serves the real documents through the full HTTP path', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('logbook', 'handwritten', 'Journal de bord', true)`);
      const response = await app.server.inject({ method: 'GET', url: '/documents' });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: TextDocument[] }>();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.title).toBe('Journal de bord');
    } finally {
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
  });
});

describe('GET /pages', () => {
  test('filters by documentId, imageUrl percent-encodes the slash', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('logbook', 'handwritten', 'Journal', true)`);
      await setup.query(`INSERT INTO pipeline.page (id, document_id, ordinal, image_relpath, width, height)
                         VALUES ('logbook/p001', 'logbook', 1, 'p001.jpg', 810, 1250)`);
      const response = await app.server.inject({ method: 'GET', url: '/pages?documentId=logbook' });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: TextPage[] }>();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.imageUrl).toBe('/pages/image?pageId=logbook%2Fp001');
    } finally {
      await setup.query(`DELETE FROM pipeline.page WHERE document_id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
  });
});

describe('GET /pages/image', () => {
  test('pageId is required, a named 400 without it', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/pages/image' });
    expect(response.statusCode).toBe(400);
  });

  test('an unknown pageId is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/pages/image?pageId=nowhere%2Fp001' });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
  });

  test('a known page whose file is missing on disk is SOURCE_FILE_MISSING', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('logbook', 'handwritten', 'Journal', true)`);
      await setup.query(`INSERT INTO pipeline.page (id, document_id, ordinal, image_relpath, width, height)
                         VALUES ('logbook/p001', 'logbook', 1, 'p001.jpg', 810, 1250)`);
      const response = await app.server.inject({ method: 'GET', url: '/pages/image?pageId=logbook%2Fp001' });
      expect(response.statusCode).toBe(404);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('SOURCE_FILE_MISSING');
    } finally {
      await setup.query(`DELETE FROM pipeline.page WHERE document_id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
  });

  test('serves the real bytes when the file exists', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('logbook', 'handwritten', 'Journal', true)`);
      await setup.query(`INSERT INTO pipeline.page (id, document_id, ordinal, image_relpath, width, height)
                         VALUES ('logbook/p001', 'logbook', 1, 'p001.jpg', 810, 1250)`);
      await writeFile(path.join(pagesRoot, 'p001.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0x00]));

      const response = await app.server.inject({ method: 'GET', url: '/pages/image?pageId=logbook%2Fp001' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.rawPayload.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    } finally {
      await setup.query(`DELETE FROM pipeline.page WHERE document_id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
  });
});

describe('GET /texts', () => {
  test('an unknown parameter is a named 400', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/texts?documnetId=x' });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('UNKNOWN_PARAMETER');
  });

  test('an empty database returns a well-formed empty envelope', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/texts' });
    expect(response.statusCode).toBe(200);
    const body = response.json<ListEnvelope<TextUnit>>();
    expect(body).toMatchObject({ items: [], total: 0 });
  });

  test('real texts round-trip through the full HTTP path, kind disambiguates the same id', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('logbook', 'handwritten', 'Journal', true)`);
      await setup.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
        VALUES ('passage', 'logbook/p003/001', 'logbook', 1, 'texte passage', 'transcribed'),
               ('log_entry', 'logbook/p003/001', 'logbook', 1, 'texte journal', 'transcribed')`);

      const response = await app.server.inject({ method: 'GET', url: '/texts?kind=passage' });
      const body = response.json<ListEnvelope<TextUnit>>();
      expect(body.total).toBe(1);
      expect(body.items[0]?.text).toBe('texte passage');
    } finally {
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
  });
});

describe('PUT /corrections', () => {
  test('an empty or blank correction is refused — 422 EMPTY_CORRECTION', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('logbook', 'handwritten', 'Journal', true)`);
      await setup.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                         VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'amont', 'transcribed')`);

      const response = await app.server.inject({
        method: 'PUT', url: '/corrections',
        payload: { ref: { kind: 'log_entry', id: 'logbook/p001/001' }, text: '   ' },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('EMPTY_CORRECTION');
    } finally {
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
  });

  test('a real correction round-trips, search finds it, revert restores the upstream body', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('logbook', 'handwritten', 'Journal', true)`);
      await setup.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                         VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'amont', 'transcribed')`);

      const put = await app.server.inject({
        method: 'PUT', url: '/corrections',
        payload: { ref: { kind: 'log_entry', id: 'logbook/p001/001' }, text: 'xylophone introuvable ailleurs' },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json<TextUnit>().text).toBe('xylophone introuvable ailleurs');

      const searched = await app.server.inject({ method: 'GET', url: '/texts?q=xylophone' });
      expect(searched.json<ListEnvelope<TextUnit>>().total).toBe(1);

      const reverted = await app.server.inject({
        method: 'POST', url: '/corrections/revert',
        payload: { ref: { kind: 'log_entry', id: 'logbook/p001/001' } },
      });
      expect(reverted.statusCode).toBe(200);
      expect(reverted.json<TextUnit>().text).toBe('amont');
      expect(reverted.json<TextUnit>().correction).toBeNull();
    } finally {
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
  });

  test('an unknown text ref is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({
      method: 'PUT', url: '/corrections',
      payload: { ref: { kind: 'log_entry', id: 'nowhere/001' }, text: 'x' },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('GET /corrections', () => {
  test('lists corrections, filterable by status', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('logbook', 'handwritten', 'Journal', true)`);
      await setup.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                         VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'amont', 'transcribed')`);
      await app.server.inject({
        method: 'PUT', url: '/corrections',
        payload: { ref: { kind: 'log_entry', id: 'logbook/p001/001' }, text: 'corrigé' },
      });

      const response = await app.server.inject({ method: 'GET', url: '/corrections?status=applied' });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: { status: string }[] }>();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.status).toBe('applied');
    } finally {
      await setup.query(`DELETE FROM app.text_correction`);
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
  });
});
