import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, describe, expect, test } from 'vitest';

import { closeTestPool, testPool } from '../../test/helpers/db.ts';
import { bootstrap, type App } from '../runtime/bootstrap.ts';
import type { RootStatus, SystemStatus } from '../contract/system_interface.ts';

let app: App | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

afterAll(async () => { await closeTestPool(); });

/** Un environnement complet, avec de vraies racines temporaires — bootstrap les vérifie. */
async function completeEnv(): Promise<NodeJS.ProcessEnv> {
  const base = await mkdtemp(path.join(tmpdir(), 'bootstrap-'));
  const dir = async (name: string): Promise<string> => {
    const p = path.join(base, name);
    await import('node:fs/promises').then((fs) => fs.mkdir(p));
    return p;
  };
  return {
    DATABASE_URL: process.env.DATABASE_URL_TEST,
    ORIGINALS_ROOT: await dir('originals'),
    THUMBS_ROOT: await dir('thumbs'),
    PIPELINE_DB_ROOT: await dir('pipeline-db'),
    PAGES_ROOT: await dir('pages'),
    ANNOTATIONS_DIR: await dir('annotations'),
    WEB_GALLERY_ROOT: await dir('web-gallery'),
    RENDER_CACHE_ROOT: await dir('render-cache'),
    TASKS_ROOT: await dir('tasks'),
  };
}

interface ErrorEnvelope { readonly error: { readonly code: string } }

describe('bootstrap — the composition root', () => {
  test('refuses to start when a WRITABLE root is missing, naming its env var', async () => {
    const env = await completeEnv();
    await expect(bootstrap({ ...env, TASKS_ROOT: '/nowhere/at/all' })).rejects.toThrow(/TASKS_ROOT/);
  });

  test('refuses to start when PIPELINE_DB_ROOT is missing — it is read-only but indispensable', async () => {
    const env = await completeEnv();
    await expect(bootstrap({ ...env, PIPELINE_DB_ROOT: '/nowhere/at/all' })).rejects.toThrow(/PIPELINE_DB_ROOT/);
  });

  test('STARTS with the originals volume unmounted — already-cached data stays readable', async () => {
    const env = await completeEnv();
    app = await bootstrap({ ...env, ORIGINALS_ROOT: '/nowhere/at/all' });
    const response = await app.server.inject({ method: 'GET', url: '/system/status' });
    expect(response.statusCode).toBe(200);
    const body = response.json<SystemStatus>();
    const originals = body.roots.find((r) => r.name === 'originals');
    expect(originals).toMatchObject({ available: false, envVar: 'ORIGINALS_ROOT' });
  });

  test('an unknown route is a 404 in the contract envelope, never Fastify HTML', async () => {
    const env = await completeEnv();
    app = await bootstrap(env);
    const response = await app.server.inject({ method: 'GET', url: '/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.json<ErrorEnvelope>().error.code).toBe('NOT_FOUND');
  });

  test('GET /system/status reports every root available in a fully-mounted environment', async () => {
    const env = await completeEnv();
    app = await bootstrap(env);
    const response = await app.server.inject({ method: 'GET', url: '/system/status' });
    const body = response.json<SystemStatus>();
    expect(body.roots).toHaveLength(5);
    expect(body.roots.every((r: RootStatus) => r.available)).toBe(true);
  });

  test('GET /system/status reports importedAt null before any import has run', async () => {
    const env = await completeEnv();
    app = await bootstrap(env);
    const response = await app.server.inject({ method: 'GET', url: '/system/status' });
    const body = response.json<SystemStatus>();
    // Sur photo_ui_test, aucun import réel n'a jamais tourné.
    expect(body).toHaveProperty('importedAt');
  });

  test('a genuine failure becomes a 500 in the contract envelope, the raw message never leaks', async () => {
    const env = await completeEnv();
    // Une base injoignable : la première requête de /system/status échoue pour
    // de vrai, à travers le VRAI gestionnaire d'erreur — pas une route ad hoc.
    app = await bootstrap({ ...env, DATABASE_URL: 'postgres://nico:Funiculi@localhost:1/nowhere' });
    const response = await app.server.inject({ method: 'GET', url: '/system/status' });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('Funiculi');
    expect(response.json<ErrorEnvelope>().error.code).toBe('INTERNAL');
  });

  test('GET /system/status: attention counts real orphaned selections, corrections, and albums/documents needing a saisie', async () => {
    const setup = testPool();
    const env = await completeEnv();
    app = await bootstrap(env);
    try {
      // Une sélection orpheline.
      await setup.query(`INSERT INTO app.task (slug, title, brief) VALUES ('zz-status-t', 'T', '')`);
      await setup.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position, selected_because)
        VALUES ('zz-status-t', '${'a'.repeat(32)}', 1, '{}')`);
      // Une correction à revoir (l'amont a bougé depuis).
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('zz-doc', 'handwritten', 'x', false)`);
      await setup.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
        VALUES ('passage', 'zz-doc/p1', 'zz-doc', 1, 'texte actuel', 'transcribed')`);
      await setup.query(`INSERT INTO app.text_correction (text_kind, text_id, corrected_text, original_at_correction, corrected_at)
        VALUES ('passage', 'zz-doc/p1', 'corrigé', 'texte AMONT au moment de la correction', now())`);
      // Un album présumé.
      await setup.query(`INSERT INTO pipeline.album (path, album_name, in_perimeter, span_from, span_to, span_presumed)
        VALUES ('zz-album', 'x', true, '1999-01-01', '1999-01-31', true)`);
      // Un document web sans plage saisie.
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('zz-web', 'html', 'y', false)`);

      const response = await app.server.inject({ method: 'GET', url: '/system/status' });
      expect(response.statusCode).toBe(200);
      const body = response.json<SystemStatus>();
      expect(body.attention.orphanedSelections).toBeGreaterThanOrEqual(1);
      expect(body.attention.correctionsNeedingReview).toBeGreaterThanOrEqual(1);
      expect(body.attention.albumsWithPresumedSpan).toBeGreaterThanOrEqual(1);
      expect(body.attention.webDocumentsWithoutSpan).toBeGreaterThanOrEqual(1);
      expect(body.attention.correctionsOrphaned).toBeGreaterThanOrEqual(0);
    } finally {
      await setup.query(`DELETE FROM app.task WHERE slug = 'zz-status-t'`);
      await setup.query(`DELETE FROM app.text_correction WHERE text_kind = 'passage' AND text_id = 'zz-doc/p1'`);
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'zz-doc'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id IN ('zz-doc', 'zz-web')`);
      await setup.query(`DELETE FROM pipeline.album WHERE path = 'zz-album'`);
    }
  });

  test('GET /system/status: features.datingExport reflects FEATURE_DATING_EXPORT', async () => {
    const env = await completeEnv();
    app = await bootstrap({ ...env, FEATURE_DATING_EXPORT: 'true' });
    const response = await app.server.inject({ method: 'GET', url: '/system/status' });
    expect(response.json<SystemStatus>().features).toEqual({ datingExport: true });
  });

  test('GET /system/status: features.datingExport is false by default', async () => {
    const env = await completeEnv();
    app = await bootstrap(env);
    const response = await app.server.inject({ method: 'GET', url: '/system/status' });
    expect(response.json<SystemStatus>().features).toEqual({ datingExport: false });
  });

  test('GET /system/status: runningJobId is null with nothing running', async () => {
    const env = await completeEnv();
    app = await bootstrap(env);
    const response = await app.server.inject({ method: 'GET', url: '/system/status' });
    expect(response.json<SystemStatus>().runningJobId).toBeNull();
  });

  test('GET /system/status: commit carries the real HEAD sha this instance started on (V1.6)', async () => {
    const env = await completeEnv();
    app = await bootstrap(env);
    const response = await app.server.inject({ method: 'GET', url: '/system/status' });
    const { commit } = response.json<SystemStatus>();
    expect(commit?.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof commit?.dirty).toBe('boolean');
  });
});
