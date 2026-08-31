import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool } from '../../test/helpers/db.ts';
import type { AlbumSpanUpdateResult } from '../contract/photo_interface.ts';
import type { TextDocument, WebDocumentRow } from '../contract/text_interface.ts';
import { bootstrap, type App } from '../runtime/bootstrap.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

let app: App | undefined;

async function completeEnv(): Promise<NodeJS.ProcessEnv> {
  const base = await mkdtemp(path.join(tmpdir(), 'ref-controller-'));
  const dir = async (name: string): Promise<string> => {
    const p = path.join(base, name);
    await mkdir(p);
    return p;
  };
  const annotationsDir = await dir('annotations');
  await writeFile(path.join(annotationsDir, 'annotations.jsonl'), '');
  return {
    DATABASE_URL: process.env.DATABASE_URL_TEST,
    ORIGINALS_ROOT: await dir('originals'), THUMBS_ROOT: await dir('thumbs'),
    PIPELINE_DB_ROOT: await dir('pipeline-db'), PAGES_ROOT: await dir('pages'),
    ANNOTATIONS_DIR: annotationsDir, WEB_GALLERY_ROOT: await dir('web-gallery'), WEB_SITE_ROOT: await dir('web-site'),
    RENDER_CACHE_ROOT: await dir('render-cache'), TASKS_ROOT: await dir('tasks'),
  };
}

afterEach(async () => { await app?.close(); app = undefined; });

describe('PUT /ref/album-span', () => {
  test('a saisie recomputes the album and returns the updated Album with real stats', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.album
        (path, album_name, in_perimeter, span_from, span_to, span_presumed)
        VALUES ('set/x', '1999-01 x', true, '1999-01-01', '1999-01-31', true)`);

      const response = await app.server.inject({
        method: 'PUT', url: '/ref/album-span',
        payload: { albumPath: 'set/x', dateFrom: '1999-06-10', dateTo: '1999-06-10', note: 'saisi à la main' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<AlbumSpanUpdateResult>();
      expect(body.album.span).toEqual({ from: '1999-06-10', to: '1999-06-10', presumed: false, note: 'saisi à la main' });
      expect(body.recomputed).toEqual({ photosAffected: 0, datesChanged: 0, precisionChanged: 0 });
      expect(body.warnings).toEqual([]);
    } finally {
      await setup.query(`DELETE FROM ref.album_span WHERE album_path = 'set/x'`);
      await setup.query(`DELETE FROM pipeline.album WHERE path = 'set/x'`);
    }
  });

  test('dateTo < dateFrom is a named 400', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({
      method: 'PUT', url: '/ref/album-span',
      payload: { albumPath: 'set/x', dateFrom: '1999-06-10', dateTo: '1999-06-01', note: null },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('INVALID_PARAMETER');
  });

  test('an unknown albumPath is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({
      method: 'PUT', url: '/ref/album-span',
      payload: { albumPath: 'set/nowhere', dateFrom: '1999-01-01', dateTo: '1999-01-31', note: null },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /ref/album-span', () => {
  test('restores presumed, derived from the prefix, and recomputes again', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.album
        (path, album_name, in_perimeter, span_from, span_to, span_presumed)
        VALUES ('set/x', '1999-06 x', true, '1999-01-01', '1999-01-31', true)`);
      await app.server.inject({
        method: 'PUT', url: '/ref/album-span',
        payload: { albumPath: 'set/x', dateFrom: '1999-06-10', dateTo: '1999-06-10', note: null },
      });

      const response = await app.server.inject({ method: 'DELETE', url: '/ref/album-span', payload: { albumPath: 'set/x' } });
      expect(response.statusCode).toBe(200);
      const body = response.json<AlbumSpanUpdateResult>();
      expect(body.album.span).toEqual({ from: '1999-06-01', to: '1999-06-30', presumed: true, note: null });
    } finally {
      await setup.query(`DELETE FROM ref.album_span WHERE album_path = 'set/x'`);
      await setup.query(`DELETE FROM pipeline.album WHERE path = 'set/x'`);
    }
  });

  test('an unknown albumPath is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'DELETE', url: '/ref/album-span', payload: { albumPath: 'set/nowhere' } });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
  });
});

describe('GET /ref/web-documents', () => {
  test('serves the excerpt and pathHint through the full HTTP path (scope=all — a single passage is below the perimeter threshold)', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('site/journal', 'html', 'Journal du site', false)`);
      await setup.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                         VALUES ('passage', 'site/journal#1', 'site/journal', 1, 'Premier passage', 'transcribed')`);

      const response = await app.server.inject({ method: 'GET', url: '/ref/web-documents?scope=all' });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: WebDocumentRow[] }>();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.excerpt).toBe('Premier passage');
      expect(body.items[0]?.pathHint).toBe('site/journal');
    } finally {
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'site/journal'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'site/journal'`);
    }
  });

  test('an unknown scope is a named 400', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/ref/web-documents?scope=bogus' });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('INVALID_PARAMETER');
  });

  test('scope defaults to perimeter — a document below two passages never shows, whatever its date', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
        VALUES ('web/1999/bidon', 'html', 'x', false), ('web/1999/vrai', 'html', 'x', false)`);
      await setup.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
        VALUES ('passage', 'web/1999/bidon#1', 'web/1999/bidon', 1, 'seul', 'transcribed'),
               ('passage', 'web/1999/vrai#1', 'web/1999/vrai', 1, 'un', 'transcribed'),
               ('passage', 'web/1999/vrai#2', 'web/1999/vrai', 2, 'deux', 'transcribed')`);

      const response = await app.server.inject({ method: 'GET', url: '/ref/web-documents' });
      const ids = response.json<{ items: WebDocumentRow[] }>().items.map((d) => d.documentId);
      expect(ids).not.toContain('web/1999/bidon');
      expect(ids).toContain('web/1999/vrai');
    } finally {
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id IN ('web/1999/bidon', 'web/1999/vrai')`);
      await setup.query(`DELETE FROM pipeline.document WHERE id IN ('web/1999/bidon', 'web/1999/vrai')`);
    }
  });

  test('a document with a year OUTSIDE the period, and no in-period proposal, is excluded from the perimeter', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('web/2005/raiders/nico', 'html', 'x', false)`);
      await setup.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
        VALUES ('passage', 'web/2005/raiders/nico#1', 'web/2005/raiders/nico', 1, 'un', 'transcribed'),
               ('passage', 'web/2005/raiders/nico#2', 'web/2005/raiders/nico', 2, 'deux', 'transcribed')`);

      const perimeter = await app.server.inject({ method: 'GET', url: '/ref/web-documents' });
      expect(perimeter.json<{ items: WebDocumentRow[] }>().items.map((d) => d.documentId))
        .not.toContain('web/2005/raiders/nico');

      const all = await app.server.inject({ method: 'GET', url: '/ref/web-documents?scope=all' });
      expect(all.json<{ items: WebDocumentRow[] }>().items.map((d) => d.documentId))
        .toContain('web/2005/raiders/nico');
    } finally {
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'web/2005/raiders/nico'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'web/2005/raiders/nico'`);
    }
  });
});

describe('PUT /ref/web-span', () => {
  test('a saisie sets the document span — a single bound, alone its own end (A9)', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('site/journal', 'html', 'Journal du site', false)`);

      const response = await app.server.inject({
        method: 'PUT', url: '/ref/web-span',
        payload: { documentId: 'site/journal', dateFrom: '2003-04-01', note: 'chemin daté' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<TextDocument>();
      expect(body.span).toEqual({
        start: '2003-04-01', end: '2003-04-01', precision: 'day', kind: 'inference', source: 'web_span', bracketHours: null,
      });
    } finally {
      await setup.query(`DELETE FROM ref.web_span WHERE document_id = 'site/journal'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'site/journal'`);
    }
  });

  test('an unknown documentId is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({
      method: 'PUT', url: '/ref/web-span',
      payload: { documentId: 'site/nowhere', dateFrom: '2003-04-01', note: null },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
  });

  test('a non-html document is a named 404, ref.web_span only serves rule C', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('logbook', 'handwritten', 'Journal de bord', true)`);
      const response = await app.server.inject({
        method: 'PUT', url: '/ref/web-span',
        payload: { documentId: 'logbook', dateFrom: '2003-04-01', note: null },
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
  });

  test('two dated documents chain by DATE, an undated one between them stays without a period', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES
        ('site/a', 'html', 'a', false), ('site/b', 'html', 'b', false), ('site/bidon', 'html', 'bidon', false)`);
      await app.server.inject({ method: 'PUT', url: '/ref/web-span', payload: { documentId: 'site/a', dateFrom: '2000-01-01', note: null } });
      await app.server.inject({ method: 'PUT', url: '/ref/web-span', payload: { documentId: 'site/b', dateFrom: '2000-02-01', note: null } });

      const docs = await app.server.inject({ method: 'GET', url: '/ref/web-documents?scope=all' });
      const rows = docs.json<{ items: { documentId: string; span: { start: string; end: string } | null }[] }>().items;
      expect(rows.find((r) => r.documentId === 'site/a')?.span).toMatchObject({ start: '2000-01-01', end: '2000-01-31' });
      expect(rows.find((r) => r.documentId === 'site/bidon')?.span).toBeNull();
    } finally {
      await setup.query(`DELETE FROM ref.web_span WHERE document_id IN ('site/a', 'site/b')`);
      await setup.query(`DELETE FROM pipeline.document WHERE id IN ('site/a', 'site/b', 'site/bidon')`);
    }
  });
});

describe('DELETE /ref/web-span', () => {
  test('clears the document span', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('site/journal', 'html', 'Journal du site', false)`);
      await app.server.inject({
        method: 'PUT', url: '/ref/web-span',
        payload: { documentId: 'site/journal', dateFrom: '2003-04-01', note: null },
      });

      const response = await app.server.inject({ method: 'DELETE', url: '/ref/web-span', payload: { documentId: 'site/journal' } });
      expect(response.statusCode).toBe(200);
      expect(response.json<TextDocument>().span).toBeNull();
    } finally {
      await setup.query(`DELETE FROM ref.web_span WHERE document_id = 'site/journal'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'site/journal'`);
    }
  });

  test('an unknown documentId is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'DELETE', url: '/ref/web-span', payload: { documentId: 'site/nowhere' } });
    expect(response.statusCode).toBe(404);
  });
});
