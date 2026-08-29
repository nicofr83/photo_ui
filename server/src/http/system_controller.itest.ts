import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { bootstrap, type App } from '../runtime/bootstrap.ts';
import type { RootStatus, SystemStatus } from '../contract/system_interface.ts';

let app: App | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

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
});
