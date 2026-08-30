import { existsSync } from 'node:fs';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool } from '../../test/helpers/db.ts';
import type { TaskDeleteResult, TaskDetail, TaskReview, TaskSummary } from '../contract/task_interface.ts';
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

  test('a bare id string in add[] is a named 400 — never a silent unknown_photo', async () => {
    app = await bootstrap(await completeEnv());
    await app.server.inject({ method: 'POST', url: '/tasks', payload: { title: 'x', slug: 'x', brief: '', period: null } });
    const response = await app.server.inject({
      method: 'POST', url: '/tasks/x/images', payload: { add: ['a'.repeat(32)] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('INVALID_PARAMETER');
  });

  test('a genuinely unknown photo in add[] carries cloudAssetId in rejected[], never a dropped field', async () => {
    app = await bootstrap(await completeEnv());
    await app.server.inject({ method: 'POST', url: '/tasks', payload: { title: 'x', slug: 'x', brief: '', period: null } });
    const id = 'f'.repeat(32);
    const response = await app.server.inject({
      method: 'POST', url: '/tasks/x/images',
      payload: { add: [{ cloudAssetId: id, selectedBecause: ['manual'] }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ rejected: { cloudAssetId: string; reason: string }[] }>().rejected)
      .toEqual([{ cloudAssetId: id, reason: 'unknown_photo' }]);
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

  test('after a successful export, GET /tasks/:slug reports state EXPORTED, not draft — front\'s exact repro', async () => {
    app = await bootstrap(await completeEnv());
    await app.server.inject({
      method: 'POST', url: '/tasks',
      payload: { title: 'x', slug: 'x', brief: '', period: null },
    });

    const submitted = await app.server.inject({ method: 'POST', url: '/tasks/x/export' });
    const job = submitted.json<{ id: string }>();

    const deadline = Date.now() + 2000;
    let jobState: string | undefined;
    while (Date.now() < deadline) {
      const poll = await app.server.inject({ method: 'GET', url: `/jobs/${job.id}` });
      jobState = poll.json<{ state: string }>().state;
      if (jobState !== 'queued' && jobState !== 'running') break;
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
    expect(jobState).toBe('succeeded');

    const detail = await app.server.inject({ method: 'GET', url: '/tasks/x' });
    const body = detail.json<TaskDetail>();
    expect(body.state).toBe('exported');
    expect(body.exportedAt).not.toBeNull();
    expect(body.exportDirectory).not.toBeNull();
    expect(body.exportedContentHash).toBe(body.contentHash);
  });
});

describe('POST /tasks/:slug/texts', () => {
  test('adds a real text by (kind, id), through the full HTTP path', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('logbook', 'handwritten', 'Journal', true)`);
      await setup.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                         VALUES ('passage', 'logbook/p001/001', 'logbook', 1, 'x', 'transcribed')`);
      await app.server.inject({
        method: 'POST', url: '/tasks', payload: { title: 'x', slug: 'x', brief: '', period: null },
      });

      const response = await app.server.inject({
        method: 'POST', url: '/tasks/x/texts',
        payload: { add: [{ kind: 'passage', id: 'logbook/p001/001' }] },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ added: number; textCount: number }>();
      expect(body.added).toBe(1);
      expect(body.textCount).toBe(1);
    } finally {
      await setup.query(`DELETE FROM app.task_text WHERE task_slug = 'x'`);
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
  });

  test('an unknown task slug is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'POST', url: '/tasks/nowhere/texts', payload: { add: [] } });
    expect(response.statusCode).toBe(404);
  });

  test('a bare id string in add[] is a named 400 — a TextRef needs both kind and id', async () => {
    app = await bootstrap(await completeEnv());
    await app.server.inject({ method: 'POST', url: '/tasks', payload: { title: 'x', slug: 'x', brief: '', period: null } });
    const response = await app.server.inject({
      method: 'POST', url: '/tasks/x/texts', payload: { add: ['logbook/p001/001'] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('INVALID_PARAMETER');
  });
});

describe('POST /tasks/:slug/notes', () => {
  test('creates a general note, 201, empty attachedTo arrays never null', async () => {
    app = await bootstrap(await completeEnv());
    await app.server.inject({
      method: 'POST', url: '/tasks', payload: { title: 'x', slug: 'x', brief: '', period: null },
    });

    const response = await app.server.inject({
      method: 'POST', url: '/tasks/x/notes',
      payload: { title: 'Ce que le journal ne dit pas', text: 'x', attachedTo: { images: [], texts: [] } },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<{ id: string; attachedTo: { images: string[]; texts: unknown[] } }>();
    expect(body.attachedTo).toEqual({ images: [], texts: [] });
  });

  test('an unknown task slug is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({
      method: 'POST', url: '/tasks/nowhere/notes',
      payload: { title: 'x', text: 'x', attachedTo: { images: [], texts: [] } },
    });
    expect(response.statusCode).toBe(404);
  });

  test('derivedFrom names the source text, editedSince starts false — through the full HTTP path', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    try {
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('logbook', 'handwritten', 'Journal', true)`);
      await setup.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
        VALUES ('passage', 'logbook/p003/001', 'logbook', 1, 'Départ de Figueira.', 'transcribed')`);
      await app.server.inject({ method: 'POST', url: '/tasks', payload: { title: 'x', slug: 'x', brief: '', period: null } });

      const response = await app.server.inject({
        method: 'POST', url: '/tasks/x/notes',
        payload: {
          title: 'journal de bord, page 3 du 09/07/1998', text: 'Départ de Figueira.',
          attachedTo: { images: [], texts: [] }, derivedFrom: { kind: 'passage', id: 'logbook/p003/001' },
        },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json<{ derivedFrom: { kind: string; id: string }; editedSince: boolean }>();
      expect(body.derivedFrom).toEqual({ kind: 'passage', id: 'logbook/p003/001' });
      expect(body.editedSince).toBe(false);
    } finally {
      await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
    }
  });
});

describe('PATCH /tasks/:slug/notes/:noteId', () => {
  test('updates only the provided fields', async () => {
    app = await bootstrap(await completeEnv());
    await app.server.inject({
      method: 'POST', url: '/tasks', payload: { title: 'x', slug: 'x', brief: '', period: null },
    });
    const created = await app.server.inject({
      method: 'POST', url: '/tasks/x/notes',
      payload: { title: 'Avant', text: 'brief initial', attachedTo: { images: [], texts: [] } },
    });
    const noteId = created.json<{ id: string }>().id;

    const response = await app.server.inject({
      method: 'PATCH', url: `/tasks/x/notes/${noteId}`, payload: { title: 'Après' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ title: string; text: string }>();
    expect(body.title).toBe('Après');
    expect(body.text).toBe('brief initial');
  });

  test('an unknown note is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    await app.server.inject({
      method: 'POST', url: '/tasks', payload: { title: 'x', slug: 'x', brief: '', period: null },
    });
    const response = await app.server.inject({
      method: 'PATCH', url: '/tasks/x/notes/note_nowhere', payload: { title: 'x' },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('DELETE /tasks/:slug/notes/:noteId', () => {
  test('204, and the note is gone', async () => {
    app = await bootstrap(await completeEnv());
    await app.server.inject({
      method: 'POST', url: '/tasks', payload: { title: 'x', slug: 'x', brief: '', period: null },
    });
    const created = await app.server.inject({
      method: 'POST', url: '/tasks/x/notes',
      payload: { title: 'x', text: 'x', attachedTo: { images: [], texts: [] } },
    });
    const noteId = created.json<{ id: string }>().id;

    const response = await app.server.inject({ method: 'DELETE', url: `/tasks/x/notes/${noteId}` });
    expect(response.statusCode).toBe(204);

    const detail = await app.server.inject({ method: 'GET', url: '/tasks/x' });
    expect(detail.json<{ notes: unknown[] }>().notes).toEqual([]);
  });

  test('an unknown note is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    await app.server.inject({
      method: 'POST', url: '/tasks', payload: { title: 'x', slug: 'x', brief: '', period: null },
    });
    const response = await app.server.inject({ method: 'DELETE', url: '/tasks/x/notes/note_nowhere' });
    expect(response.statusCode).toBe(404);
  });
});

describe('GET /tasks/:slug/review', () => {
  test('the timeline carries bounds, and the eight warning keys are all present, through the full HTTP path', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    const id = 'a'.repeat(32);
    try {
      await setup.query(`INSERT INTO pipeline.photo
        (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
         resolved_from, resolved_start, resolved_end, resolved_precision)
        VALUES ($1, $2, 'x/a.jpg', 'a.jpg', 'jpg', 'exif', 'annotation', '2000-01-01', '2000-01-01', 'day')`,
        [id, 'b'.repeat(64)]);
      await app.server.inject({
        method: 'POST', url: '/tasks', payload: { title: 'x', slug: 'x', brief: '', period: null },
      });
      await app.server.inject({
        method: 'POST', url: '/tasks/x/images', payload: { add: [{ cloudAssetId: id, selectedBecause: ['manual'] }] },
      });

      const response = await app.server.inject({ method: 'GET', url: '/tasks/x/review' });
      expect(response.statusCode).toBe(200);
      const review = response.json<TaskReview>();

      expect(Object.keys(review.warnings).sort()).toEqual([
        'imagesOutOfPeriod', 'imagesWithoutText', 'inferredDateImages', 'orphanedImages',
        'orphanedTexts', 'textsWiderThan30Days', 'uncertainTexts', 'undatedImages',
      ]);
      expect(review.timeline).toHaveLength(1);
      for (const entry of review.timeline) {
        expect(typeof entry.start).toBe('string');
        expect(typeof entry.end).toBe('string');
        expect(typeof entry.precision).toBe('string');
        expect(typeof entry.dateKind).toBe('string');
      }
    } finally {
      await setup.query('DELETE FROM pipeline.photo');
    }
  });

  test('an unknown slug is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'GET', url: '/tasks/nowhere/review' });
    expect(response.statusCode).toBe(404);
  });
});

describe('POST /tasks/:slug/duplicate', () => {
  test('duplicating copies the selection but not the export state', async () => {
    const setup = testPool();
    app = await bootstrap(await completeEnv());
    const id = 'a'.repeat(32);
    try {
      await setup.query(`INSERT INTO pipeline.photo
        (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
        VALUES ($1, $2, 'x/a.jpg', 'a.jpg', 'jpg', 'none')`, [id, 'b'.repeat(64)]);
      await app.server.inject({
        method: 'POST', url: '/tasks', payload: { title: 'x', slug: 'x', brief: '', period: null },
      });
      await app.server.inject({
        method: 'POST', url: '/tasks/x/images', payload: { add: [{ cloudAssetId: id, selectedBecause: ['manual'] }] },
      });

      const response = await app.server.inject({
        method: 'POST', url: '/tasks/x/duplicate', payload: { title: 'x v2', slug: 'x-v2' },
      });
      expect(response.statusCode).toBe(201);
      const copy = response.json<TaskDetail>();
      expect(copy.images).toHaveLength(1);
      expect(copy.state).toBe('draft');
      expect(copy.exportedAt).toBeNull();
    } finally {
      await setup.query('DELETE FROM pipeline.photo');
    }
  });

  test('an unknown source slug is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({
      method: 'POST', url: '/tasks/nowhere/duplicate', payload: { title: 'x', slug: 'x' },
    });
    expect(response.statusCode).toBe(404);
  });

  test('a taken slug is a named 409', async () => {
    app = await bootstrap(await completeEnv());
    await app.server.inject({
      method: 'POST', url: '/tasks', payload: { title: 'A', slug: 'a', brief: '', period: null },
    });
    await app.server.inject({
      method: 'POST', url: '/tasks', payload: { title: 'B', slug: 'b', brief: '', period: null },
    });
    const response = await app.server.inject({
      method: 'POST', url: '/tasks/a/duplicate', payload: { title: 'x', slug: 'b' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('SLUG_TAKEN');
  });
});

describe('DELETE /tasks/:slug', () => {
  test('never touches an already-exported folder, and the response names it', async () => {
    app = await bootstrap(await completeEnv());
    await app.server.inject({
      method: 'POST', url: '/tasks', payload: { title: 'x', slug: 'x', brief: '', period: null },
    });

    const exportDirectory = path.join(await mkdtemp(path.join(tmpdir(), 'already-exported-')), 'x');
    await mkdir(exportDirectory, { recursive: true });
    await testPool().query(
      `UPDATE app.task SET exported_at = now(), export_directory = $1 WHERE slug = 'x'`, [exportDirectory]);

    const response = await app.server.inject({ method: 'DELETE', url: '/tasks/x' });
    expect(response.statusCode).toBe(200);
    const body = response.json<TaskDeleteResult>();
    expect(body.exportDirectoryKept).toBe(exportDirectory);
    expect(existsSync(exportDirectory)).toBe(true);
  });

  test('an unknown slug is a named 404', async () => {
    app = await bootstrap(await completeEnv());
    const response = await app.server.inject({ method: 'DELETE', url: '/tasks/nowhere' });
    expect(response.statusCode).toBe(404);
  });
});
