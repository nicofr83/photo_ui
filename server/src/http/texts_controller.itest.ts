import { copyFile, mkdtemp, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool } from '../../test/helpers/db.ts';
import { readJpegSize } from '../../test/helpers/jpeg_size.ts';
import type { ListEnvelope } from '../contract/filter_interface.ts';
import type { TextDocument, TextPage, TextUnit } from '../contract/text_interface.ts';
import { bootstrap, type App } from '../runtime/bootstrap.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));
// Un vrai scan de page (adobe_mcp, lecture seule) — jamais un fixture synthétique
// pour un test qui doit faire tourner un VRAI `sips`.
const REAL_PAGE_SCAN = '/Users/nico/projects/adobe_mcp/docs/pages/journal-de-bord/p010.jpg';
// Les 5 vraies pages du site (V1.7, adobe_mcp, lecture seule) — un test de
// transcodage/réécriture sur un fixture synthétique ne prouverait rien sur
// le vrai `cp1252` ou les vrais chemins d'actifs FrontPage.
const REAL_WEB_SITE_ROOT = '/Users/nico/projects/adobe_mcp/docs/web_site';

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

let app: App | undefined;
let pagesRoot = '';
let renderCacheRoot = '';

async function completeEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): Promise<NodeJS.ProcessEnv> {
  const base = await mkdtemp(path.join(tmpdir(), 'texts-controller-'));
  const dir = async (name: string): Promise<string> => {
    const p = path.join(base, name);
    await mkdir(p);
    return p;
  };
  pagesRoot = await dir('pages');
  renderCacheRoot = await dir('render-cache');
  return {
    DATABASE_URL: process.env.DATABASE_URL_TEST,
    ORIGINALS_ROOT: await dir('originals'), THUMBS_ROOT: await dir('thumbs'),
    PIPELINE_DB_ROOT: await dir('pipeline-db'), PAGES_ROOT: pagesRoot,
    ANNOTATIONS_DIR: await dir('annotations'), WEB_GALLERY_ROOT: await dir('web-gallery'), WEB_SITE_ROOT: await dir('web-site'),
    RENDER_CACHE_ROOT: renderCacheRoot, TASKS_ROOT: await dir('tasks'),
    ...overrides,
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

  test('an unknown parameter is a named 400 (Task 14)', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/pages?dateFron=1999-01-01' });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('UNKNOWN_PARAMETER');
  });

  test('filters by dateFrom/dateTo — a page qualifies as soon as one of its texts is in range (Task 14)', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('ma-vie', 'handwritten', 'x', true)`);
      await setup.query(`INSERT INTO pipeline.page (id, document_id, ordinal, image_relpath, width, height) VALUES
        ('ma-vie/p001', 'ma-vie', 1, 'p.jpg', 1, 1), ('ma-vie/p002', 'ma-vie', 2, 'p.jpg', 1, 1)`);
      await setup.query(`INSERT INTO pipeline.text_unit
        (kind, id, document_id, page_id, ordinal, body, confidence, date_source, date_start, date_end) VALUES
        ('passage', 'ma-vie/p001/1', 'ma-vie', 'ma-vie/p001', 1, 'x', 'transcribed', 'passage_date_from', '1999-08-05', '1999-08-05'),
        ('passage', 'ma-vie/p002/1', 'ma-vie', 'ma-vie/p002', 1, 'x', 'transcribed', 'passage_date_from', '2000-01-01', '2000-01-01')`);

      const response = await app.server.inject({
        method: 'GET', url: '/pages?documentId=ma-vie&dateFrom=1999-08-01&dateTo=1999-08-31',
      });
      const ordinals = response.json<{ items: TextPage[] }>().items.map((p) => p.ordinal);
      expect(ordinals).toContain(1);
      expect(ordinals).not.toContain(2);
    } finally {
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'ma-vie'`);
      await setup.query(`DELETE FROM pipeline.page WHERE document_id = 'ma-vie'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'ma-vie'`);
    }
  });

  test('q returns the pages that contain the word, with their match count (Task 14)', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('ma-vie', 'handwritten', 'x', true)`);
      await setup.query(`INSERT INTO pipeline.page (id, document_id, ordinal, image_relpath, width, height)
                         VALUES ('ma-vie/p001', 'ma-vie', 1, 'p.jpg', 1, 1)`);
      await setup.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, page_id, ordinal, body, confidence)
        VALUES ('passage', 'ma-vie/p001/1', 'ma-vie', 'ma-vie/p001', 1, 'un beau mouillage', 'transcribed')`);
      await setup.query(`REFRESH MATERIALIZED VIEW app.text_search`);

      const response = await app.server.inject({ method: 'GET', url: '/pages?documentId=ma-vie&q=mouillage' });
      const items = response.json<{ items: TextPage[] }>().items;
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((p) => (p.matchCount ?? 0) > 0)).toBe(true);
    } finally {
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'ma-vie'`);
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

describe('GET /pages/thumb', () => {
  async function seedRealPage(setup: ReturnType<typeof testPool>): Promise<void> {
    await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                       VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await setup.query(`INSERT INTO pipeline.page (id, document_id, ordinal, image_relpath, width, height)
                       VALUES ('logbook/p010', 'logbook', 10, 'p010.jpg', 798, 1233)`);
    await copyFile(REAL_PAGE_SCAN, path.join(pagesRoot, 'p010.jpg'));
  }

  test('the thumbnail is the ENTIRE scan reduced — same aspect ratio, no cropping', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await seedRealPage(setup);

      const response = await app.server.inject({ method: 'GET', url: '/pages/thumb?pageId=logbook%2Fp010&edge=320' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');

      const { width, height } = await readJpegSize(response.rawPayload);
      expect(Math.max(width, height)).toBe(320);

      const source = await readJpegSize(await readFile(REAL_PAGE_SCAN));
      expect(Math.abs(width / height - source.width / source.height)).toBeLessThan(0.01);
    } finally {
      await setup.query(`DELETE FROM pipeline.page WHERE document_id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
  });

  test('a second request serves the cache — the rendered file is never rewritten', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await seedRealPage(setup);

      await app.server.inject({ method: 'GET', url: '/pages/thumb?pageId=logbook%2Fp010&edge=320' });
      const cachePath = path.join(renderCacheRoot, 'pages', 'logbook_p010-320.jpg');
      const firstWrite = await stat(cachePath);

      const response = await app.server.inject({ method: 'GET', url: '/pages/thumb?pageId=logbook%2Fp010&edge=320' });
      expect(response.statusCode).toBe(200);
      const secondWrite = await stat(cachePath);
      expect(secondWrite.mtimeMs).toBe(firstWrite.mtimeMs);
    } finally {
      await setup.query(`DELETE FROM pipeline.page WHERE document_id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
  });

  test('an unexpected size is refused, never rendered', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/pages/thumb?pageId=logbook%2Fp010&edge=4000' });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('INVALID_PARAMETER');
  });

  test('an unknown page is a named 404, not an empty image', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/pages/thumb?pageId=nowhere%2Fp001&edge=320' });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
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

describe('GET /texts/facets', () => {
  test('an unknown parameter is a named 400', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/texts/facets?documnetId=x' });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('UNKNOWN_PARAMETER');
  });

  test('serves years/months/days for a document through the full HTTP path', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('ma-vie', 'handwritten', 'x', true)`);
      await setup.query(`INSERT INTO pipeline.text_unit
        (kind, id, document_id, ordinal, body, confidence, date_source, date_start, date_end)
        VALUES ('passage', 'ma-vie/1', 'ma-vie', 1, 'x', 'transcribed', 'passage_date_from', '1999-08-04', '1999-08-04'),
               ('passage', 'ma-vie/2', 'ma-vie', 2, 'x', 'transcribed', 'passage_date_from', '1999-11-01', '1999-11-01')`);

      const response = await app.server.inject({ method: 'GET', url: '/texts/facets?documentId=ma-vie' });
      expect(response.statusCode).toBe(200);
      const facets = response.json<{ years: { value: string; count: number }[]; months: { value: string }[]; days: unknown[] }>();
      expect(facets.years).toEqual([{ value: '1999', count: 2 }]);
      expect(facets.months.map((b) => b.value)).toEqual(['1999-08', '1999-11']);
      expect(facets.days.length).toBe(2);
    } finally {
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'ma-vie'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'ma-vie'`);
    }
  });

  test('without documentId, serves facets across the whole library', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/texts/facets' });
    expect(response.statusCode).toBe(200);
    const facets = response.json<{ years: unknown[] }>();
    expect(Array.isArray(facets.years)).toBe(true);
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

  test('a corrected date spanning more than one day is a named 400 (Task V1.6, D11)', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('logbook', 'handwritten', 'Journal', true)`);
      await setup.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                         VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'amont', 'transcribed')`);

      const response = await app.server.inject({
        method: 'PUT', url: '/corrections',
        payload: {
          ref: { kind: 'log_entry', id: 'logbook/p001/001' }, text: 'x',
          date: { start: '1998-11-16', end: '1998-11-17' },
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('INVALID_PARAMETER');
    } finally {
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
  });

  test('a date that is not a real calendar day is a named 400', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('logbook', 'handwritten', 'Journal', true)`);
      await setup.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                         VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'amont', 'transcribed')`);

      const response = await app.server.inject({
        method: 'PUT', url: '/corrections',
        payload: {
          ref: { kind: 'log_entry', id: 'logbook/p001/001' }, text: 'x',
          date: { start: '1999-02-30', end: '1999-02-30' },
        },
      });
      expect(response.statusCode).toBe(400);
    } finally {
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
  });

  test('correcting a date round-trips as decision/annotation, the original reading kept aside, revert restores both (V1.6)', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('logbook', 'handwritten', 'Journal', true)`);
      await setup.query(`INSERT INTO pipeline.text_unit
        (kind, id, document_id, ordinal, body, confidence, date_source, date_start, date_end)
        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'amont', 'transcribed', 'log_entry_date', '1999-11-16', '1999-11-16')`);

      const put = await app.server.inject({
        method: 'PUT', url: '/corrections',
        payload: {
          ref: { kind: 'log_entry', id: 'logbook/p001/001' }, text: 'amont',
          date: { start: '1998-11-16', end: '1998-11-16' },
        },
      });
      expect(put.statusCode).toBe(200);
      const putBody = put.json<TextUnit>();
      expect(putBody.date).toEqual({
        start: '1998-11-16', end: '1998-11-16', precision: 'day', kind: 'decision', source: 'annotation', bracketHours: null,
      });
      expect(putBody.dateOriginal).toEqual({
        start: '1999-11-16', end: '1999-11-16', precision: 'day', kind: 'reading', source: 'log_entry_date', bracketHours: null,
      });
      expect(putBody.correction?.date).toEqual({ start: '1998-11-16', end: '1998-11-16' });
      expect(putBody.correction?.originalDateAtCorrection).toEqual({ start: '1999-11-16', end: '1999-11-16' });

      const reverted = await app.server.inject({
        method: 'POST', url: '/corrections/revert',
        payload: { ref: { kind: 'log_entry', id: 'logbook/p001/001' } },
      });
      const revertedBody = reverted.json<TextUnit>();
      expect(revertedBody.date).toEqual(putBody.dateOriginal);
      expect(revertedBody.correction).toBeNull();
    } finally {
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
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

describe('GET /texts/web/pages (V1.7)', () => {
  test('lists exactly the 5 real pages, sorted alphabetically by filename', async () => {
    app = await bootstrap(await completeEnv({ WEB_SITE_ROOT: REAL_WEB_SITE_ROOT }));
    const response = await app.server.inject({ method: 'GET', url: '/texts/web/pages' });
    expect(response.statusCode).toBe(200);
    const { items } = response.json<{ items: { id: string; title: string; label: string }[] }>();
    expect(items.map((i) => i.id)).toEqual([
      '1900-1988.htm', '1998-1999.htm', '1999-2002.htm', '2003-2004.htm', '2005-2006.htm',
    ]);
  });

  test('title and label can genuinely differ — 1900-1988.htm titles itself "1958-1998"', async () => {
    app = await bootstrap(await completeEnv({ WEB_SITE_ROOT: REAL_WEB_SITE_ROOT }));
    const response = await app.server.inject({ method: 'GET', url: '/texts/web/pages' });
    const { items } = response.json<{ items: { id: string; title: string; label: string }[] }>();
    const page = items.find((i) => i.id === '1900-1988.htm');
    expect(page?.label).toBe('1900-1988');
    expect(page?.title).toBe('1958-1998');
  });
});

describe('GET /texts/web/page (V1.7)', () => {
  test('serves a real page transcoded to UTF-8, scripts stripped, asset URLs rewritten', async () => {
    app = await bootstrap(await completeEnv({ WEB_SITE_ROOT: REAL_WEB_SITE_ROOT }));
    const response = await app.server.inject({ method: 'GET', url: '/texts/web/page?id=1998-1999.htm' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    const body = response.body;
    // cp1252 correctement transcodé — pas de mojibake sur l'accent.
    expect(body).toContain('Découverte de');
    // Retirés à la source.
    expect(body).not.toMatch(/<script/i);
    // V1.7 (team-lead, testé en direct) : un <a href> intact aurait 404 sur
    // 48 des 53 pages liées, ou pire, désynchronisé liste et iframe sur les
    // 5 servies — la provenance nommerait alors la mauvaise page.
    expect(body).not.toMatch(/<a\b[^>]*\bhref\s*=/i);
    // Le TEXTE du lien de fil d'Ariane survit, au mot près — seule la cible disparaît.
    expect(body).toContain('>1958-1998</A>');
    // La feuille de style et les images, elles, pointent vers la route d'actifs.
    expect(body).toContain('href="/texts/web/asset?path=_themes%2Ffunfun2-98%2Ffunf1011.css"');
    expect(body).toContain('src="/texts/web/asset?path=_derived%2F1998-1999.htm_cmp_funfun2-98010_bnr.gif"');
  });

  test('an id that does not match the strict pattern is a named 400, never touches the filesystem', async () => {
    app = await bootstrap(await completeEnv({ WEB_SITE_ROOT: REAL_WEB_SITE_ROOT }));
    const response = await app.server.inject({
      method: 'GET', url: `/texts/web/page?id=${encodeURIComponent('../../../etc/passwd')}`,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('INVALID_PARAMETER');
  });

  test('a well-formed id with no matching real file is a named 404', async () => {
    app = await bootstrap(await completeEnv({ WEB_SITE_ROOT: REAL_WEB_SITE_ROOT }));
    const response = await app.server.inject({ method: 'GET', url: '/texts/web/page?id=1000-1001.htm' });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
  });
});

describe('GET /texts/web/asset (V1.7)', () => {
  test('serves a real theme stylesheet, transcoded, with its own url() rewritten relative to ITS OWN directory', async () => {
    app = await bootstrap(await completeEnv({ WEB_SITE_ROOT: REAL_WEB_SITE_ROOT }));
    const response = await app.server.inject({
      method: 'GET', url: `/texts/web/asset?path=${encodeURIComponent('_themes/funfun2-98/funf1011.css')}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/css; charset=utf-8');
    // Mesuré sur le vrai fichier : `url(anetrule.gif)` doit devenir le
    // chemin complet depuis la racine du site, pas depuis la page.
    expect(response.body).toContain('/texts/web/asset?path=_themes%2Ffunfun2-98%2Fanetrule.gif');
  });

  test('serves a real binary asset (gif) with the right content-type', async () => {
    app = await bootstrap(await completeEnv({ WEB_SITE_ROOT: REAL_WEB_SITE_ROOT }));
    const response = await app.server.inject({
      method: 'GET',
      url: `/texts/web/asset?path=${encodeURIComponent('_derived/1998-1999.htm_cmp_funfun2-98010_bnr.gif')}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/gif');
  });

  test('a disallowed extension is a named 400, never touches the filesystem', async () => {
    app = await bootstrap(await completeEnv({ WEB_SITE_ROOT: REAL_WEB_SITE_ROOT }));
    const response = await app.server.inject({
      method: 'GET', url: `/texts/web/asset?path=${encodeURIComponent('.ftpquota')}`,
    });
    expect(response.statusCode).toBe(400);
  });

  test('a path-traversal attempt is refused — the point that matters most (team-lead)', async () => {
    app = await bootstrap(await completeEnv({ WEB_SITE_ROOT: REAL_WEB_SITE_ROOT }));
    // Un fichier RÉEL, avec une extension AUTORISÉE, qui existe vraiment
    // juste hors de WEB_SITE_ROOT (adobe_mcp/docs/pages, une autre racine
    // de ce même projet) — si la garde `realpath` ne travaillait pas
    // vraiment, cette requête réussirait et fuiterait un scan du journal.
    const response = await app.server.inject({
      method: 'GET',
      url: `/texts/web/asset?path=${encodeURIComponent('../pages/journal-de-bord/p001.jpg')}`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
  });
});
