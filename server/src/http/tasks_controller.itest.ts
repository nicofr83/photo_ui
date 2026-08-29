import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool } from '../../test/helpers/db.ts';
import type { TaskDetail, TaskSummary } from '../contract/task_interface.ts';
import { bootstrap, type App } from '../runtime/bootstrap.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

let app: App | undefined;

async function completeEnv(): Promise<NodeJS.ProcessEnv> {
  const base = await mkdtemp(path.join(tmpdir(), 'tasks-controller-'));
  const dir = async (name: string): Promise<string> => {
    const p = path.join(base, name);
    await import('node:fs/promises').then((fs) => fs.mkdir(p));
    return p;
  };
  return {
    DATABASE_URL: process.env.DATABASE_URL_TEST,
    ORIGINALS_ROOT: await dir('originals'), THUMBS_ROOT: await dir('thumbs'),
    PIPELINE_DB_ROOT: await dir('pipeline-db'), PAGES_ROOT: await dir('pages'),
    ANNOTATIONS_DIR: await dir('annotations'), WEB_GALLERY_ROOT: await dir('web-gallery'),
    RENDER_CACHE_ROOT: await dir('render-cache'), TASKS_ROOT: await dir('tasks'),
  };
}

afterEach(async () => {
  await app?.close();
  app = undefined;
  await testPool().query('DELETE FROM app.task');
});

describe('GET /tasks', () => {
  test('an empty database returns an empty list, never a 500', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/tasks' });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ items: TaskSummary[] }>().items).toEqual([]);
  });
});

describe('POST /tasks', () => {
  test('creates a draft task and returns its full detail, 201', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({
      method: 'POST', url: '/tasks',
      payload: { title: 'La transat', slug: 'la-transat', brief: 'brief', period: null },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<TaskDetail>();
    expect(body.slug).toBe('la-transat');
    expect(body.state).toBe('draft');
    expect(body.images).toEqual([]);
  });

  test('a taken slug is refused with 409, naming the existing title', async () => {
    app = await bootstrap(await completeEnv());
    await app.server.inject({
      method: 'POST', url: '/tasks',
      payload: { title: 'Premier', slug: 'x', brief: '', period: null },
    });
    const response = await app.server.inject({
      method: 'POST', url: '/tasks',
      payload: { title: 'Second', slug: 'x', brief: '', period: null },
    });
    expect(response.statusCode).toBe(409);
    const body = response.json<{ error: { code: string; details: { existingTaskTitle: string } } }>();
    expect(body.error.code).toBe('SLUG_TAKEN');
    expect(body.error.details.existingTaskTitle).toBe('Premier');
  });

  test('a malformed slug is a named 400, never a raw Postgres constraint violation', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({
      method: 'POST', url: '/tasks',
      payload: { title: 'x', slug: 'Not A Slug!', brief: '', period: null },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('INVALID_PARAMETER');
  });

  test('an inverted period is a named 400', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({
      method: 'POST', url: '/tasks',
      payload: { title: 'x', slug: 'x', brief: '', period: { from: '2000-12-31', to: '2000-01-01' } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('INVALID_PARAMETER');
  });
});

describe('GET /tasks/:slug', () => {
  test('an unknown slug is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/tasks/nowhere' });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
  });

  test('a real task round-trips through the full HTTP path', async () => {
    app = await bootstrap(await completeEnv());
    await app.server.inject({
      method: 'POST', url: '/tasks',
      payload: { title: 'La transat', slug: 'la-transat', brief: 'brief', period: null },
    });
    const response = await app.server.inject({ method: 'GET', url: '/tasks/la-transat' });
    expect(response.statusCode).toBe(200);
    expect(response.json<TaskDetail>().title).toBe('La transat');
  });
});

describe('PATCH /tasks/:slug', () => {
  test('updates only the provided fields', async () => {
    app = await bootstrap(await completeEnv());
    await app.server.inject({
      method: 'POST', url: '/tasks',
      payload: { title: 'Avant', slug: 'x', brief: 'brief initial', period: null },
    });
    const response = await app.server.inject({
      method: 'PATCH', url: '/tasks/x', payload: { title: 'Après' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<TaskSummary>().title).toBe('Après');

    const detail = await app.server.inject({ method: 'GET', url: '/tasks/x' });
    expect(detail.json<TaskDetail>().brief).toBe('brief initial');
  });

  test('an unknown slug is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'PATCH', url: '/tasks/nowhere', payload: { title: 'x' } });
    expect(response.statusCode).toBe(404);
  });
});

describe('POST /tasks/:slug/images', () => {
  test('adds a real photo and returns the mutation result, through the full HTTP path', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    const id = 'a'.repeat(32);
    try {
      await setup.query(`INSERT INTO pipeline.photo
        (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
        VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'none')`, [id, 'b'.repeat(64)]);
      await app.server.inject({
        method: 'POST', url: '/tasks',
        payload: { title: 'x', slug: 'x', brief: '', period: null },
      });

      const response = await app.server.inject({
        method: 'POST', url: '/tasks/x/images',
        payload: { add: [{ cloudAssetId: id, selectedBecause: ['manual'] }] },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ added: number; imageCount: number }>();
      expect(body.added).toBe(1);
      expect(body.imageCount).toBe(1);
    } finally {
      await setup.query('DELETE FROM pipeline.photo');
    }
  });

  test('an unknown task slug is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({
      method: 'POST', url: '/tasks/nowhere/images', payload: { add: [] },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
  });
});

describe('POST /tasks/:slug/export', () => {
  test('202 with an export job; a task with no images settles fast, succeeded with a real report', async () => {
    app = await bootstrap(await completeEnv());
    await app.server.inject({
      method: 'POST', url: '/tasks',
      payload: { title: 'La transat', slug: 'la-transat', brief: '', period: null },
    });

    const response = await app.server.inject({ method: 'POST', url: '/tasks/la-transat/export' });
    expect(response.statusCode).toBe(202);
    const job = response.json<{ id: string; type: string; state: string }>();
    expect(job.type).toBe('export');

    const deadline = Date.now() + 2000;
    let settled: { state: string; result: { report: { directory: string; imagesWritten: number } } } | undefined;
    while (Date.now() < deadline) {
      const poll = await app.server.inject({ method: 'GET', url: `/jobs/${job.id}` });
      const polled = poll.json<{ state: string; result: { report: { directory: string; imagesWritten: number } } }>();
      if (polled.state !== 'queued' && polled.state !== 'running') { settled = polled; break; }
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
    expect(settled?.state).toBe('succeeded');
    expect(settled?.result.report.imagesWritten).toBe(0);
  });
});
