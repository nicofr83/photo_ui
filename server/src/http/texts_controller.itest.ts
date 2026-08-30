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

  test('serves the page date with its nature: reading when own, inference when carried', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('ma-vie', 'handwritten', 'x', true)`);
      await setup.query(`INSERT INTO pipeline.page (id, document_id, ordinal, image_relpath, width, height) VALUES
        ('ma-vie/p001', 'ma-vie', 1, 'p1.jpg', 1, 1), ('ma-vie/p002', 'ma-vie', 2, 'p2.jpg', 1, 1)`);
      await setup.query(`INSERT INTO app.page_date (page_id, date_start, date_end, source) VALUES
        ('ma-vie/p001', '1999-08-04', '1999-08-04', 'notes'),
        ('ma-vie/p002', '1999-08-04', '1999-08-04', 'carried')`);

      const response = await app.server.inject({ method: 'GET', url: '/pages?documentId=ma-vie' });
      const items = response.json<{ items: TextPage[] }>().items;
      const propre = items.find((p) => p.ordinal === 1);
      const herite = items.find((p) => p.ordinal === 2);
      expect(propre?.date?.kind).toBe('reading');
      expect(herite?.date?.kind).toBe('inference');
    } finally {
      await setup.query(`DELETE FROM app.page_date WHERE page_id IN ('ma-vie/p001', 'ma-vie/p002')`);
      await setup.query(`DELETE FROM pipeline.page WHERE document_id = 'ma-vie'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'ma-vie'`);
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

  test('a date filter reports how many undated texts it excluded — never hardcoded to 0', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('logbook', 'handwritten', 'Journal', true)`);
      await setup.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence, date_source, date_start, date_end)
        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'dans la fenêtre', 'transcribed', 'log_entry_date', '1999-06-01', '1999-06-01'),
               ('log_entry', 'logbook/p002/001', 'logbook', 2, 'hors fenêtre', 'transcribed', 'log_entry_date', '2001-01-01', '2001-01-01'),
               ('log_entry', 'logbook/p003/001', 'logbook', 3, 'sans date', 'transcribed', null, null, null)`);

      const filtered = await app.server.inject({
        method: 'GET', url: '/texts?documentId=logbook&dateFrom=1999-01-01&dateTo=1999-12-31',
      });
      const filteredBody = filtered.json<ListEnvelope<TextUnit>>();
      // Seul le texte daté DANS la fenêtre compte — celui hors fenêtre n'est
      // ni retenu ni compté comme « écarté pour absence de date » : il A une
      // date, elle ne correspond juste pas. Seul l'absent compte ici.
      expect(filteredBody.total).toBe(1);
      expect(filteredBody.excludedCount).toBe(1);
      expect(filteredBody.populationTotal).toBe(filteredBody.total + filteredBody.excludedCount);

      const unfiltered = await app.server.inject({ method: 'GET', url: '/texts?documentId=logbook' });
      const unfilteredBody = unfiltered.json<ListEnvelope<TextUnit>>();
      expect(unfilteredBody.total).toBe(3);
      expect(unfilteredBody.excludedCount).toBe(0);
    } finally {
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
  });

  test('kind=web_caption is accepted (front\'s real repro — used to 400), serves a real gallery match', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO app.web_gallery_link (sha256, page, image_path, caption, distance, margin, verified)
        VALUES ($1, '2003/gal.htm', 'p01.jpg', 'Le port au matin', 4, 8, null)`, ['b'.repeat(64)]);

      const response = await app.server.inject({ method: 'GET', url: '/texts?kind=web_caption' });
      expect(response.statusCode).toBe(200);
      const body = response.json<ListEnvelope<TextUnit>>();
      expect(body.total).toBe(1);
      expect(body.items[0]?.text).toBe('Le port au matin');
      expect(body.items[0]?.galleryCaption).toEqual({
        sha256: 'b'.repeat(64), page: '2003/gal.htm', imagePath: 'p01.jpg', distance: 4, margin: 8, verified: false,
      });
    } finally {
      await setup.query(`DELETE FROM app.web_gallery_link WHERE sha256 = $1`, ['b'.repeat(64)]);
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
