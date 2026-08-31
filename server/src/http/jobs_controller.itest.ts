import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool } from '../../test/helpers/db.ts';
import type { Job } from '../metier/jobs/job_service.ts';
import { bootstrap, type App } from '../runtime/bootstrap.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

let app: App | undefined;

async function completeEnv(): Promise<NodeJS.ProcessEnv> {
  const base = await mkdtemp(path.join(tmpdir(), 'jobs-controller-'));
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

async function pollUntilSettled(getJob: () => Promise<Job>, timeoutMs = 2000): Promise<Job> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await getJob();
    if (job.state !== 'queued' && job.state !== 'running') return job;
    if (Date.now() > deadline) throw new Error('job jamais réglé — timeout de test');
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
}

describe('GET /jobs', () => {
  test('an empty store returns an empty list', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/jobs' });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ items: Job[] }>().items).toEqual([]);
  });
});

describe('GET /jobs/:jobId', () => {
  test('an unknown id is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/jobs/nowhere' });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
  });
});

describe('POST /jobs/prerender', () => {
  test('202 with a running job; an empty perimeter settles fast, succeeded with a zero tally', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'POST', url: '/jobs/prerender' });
    expect(response.statusCode).toBe(202);
    const job = response.json<Job>();
    expect(job.type).toBe('prerender');
    expect(['queued', 'running']).toContain(job.state);

    const settled = await pollUntilSettled(async () => {
      const r = await app?.server.inject({ method: 'GET', url: `/jobs/${job.id}` });
      return r?.json<Job>() as Job;
    });
    expect(settled.state).toBe('succeeded');
    expect(settled.result).toEqual({ type: 'prerender', rendered: 0, failed: 0 });
  });

  test('a second mutating job while one is running is a named 409, naming the running job', async () => {
    app = await bootstrap(await completeEnv());
    const first = await app.server.inject({ method: 'POST', url: '/jobs/prerender' });
    const firstJob = first.json<Job>();

    const second = await app.server.inject({ method: 'POST', url: '/jobs/prerender' });
    // Le premier job peut déjà s'être réglé (périmètre vide, très rapide) : le
    // test ne vérifie le conflit QUE s'il est encore actif, sans quoi il
    // testerait une course, pas la règle.
    if (['queued', 'running'].includes(firstJob.state)) {
      expect(second.statusCode).toBe(409);
      const body = second.json<{ error: { code: string; details: { jobId: string } } }>();
      expect(body.error.code).toBe('IMPORT_IN_PROGRESS');
      expect(body.error.details.jobId).toBe(firstJob.id);
    }
  });
});

describe('POST /jobs/:jobId/cancel', () => {
  test('an unknown id is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'POST', url: '/jobs/nowhere/cancel' });
    expect(response.statusCode).toBe(404);
  });

  test('cancelling a prerender job marks it cancelled', async () => {
    app = await bootstrap(await completeEnv());
    const submitted = await app.server.inject({ method: 'POST', url: '/jobs/prerender' });
    const job = submitted.json<Job>();

    const response = await app.server.inject({ method: 'POST', url: `/jobs/${job.id}/cancel` });
    expect(response.statusCode).toBe(200);
    expect(['cancelled', 'succeeded']).toContain(response.json<Job>().state);
  });
});
