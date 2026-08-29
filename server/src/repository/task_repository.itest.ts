import { fileURLToPath } from 'node:url';

import { TaskState } from '@shared/enums';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { createTask, getTaskDetail, listTasks, patchTask } from './task_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

test('createTask returns a fresh draft task with an empty content and a real hash', async () => {
  await withRollback(async (client) => {
    const result = await createTask(client, {
      title: 'La transat', slug: 'la-transat', brief: 'Un texte pour Instagram',
      period: { from: '1999-09-01', to: '1999-10-31' },
    });
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.task.state).toBe(TaskState.DRAFT);
    expect(result.task.imageCount).toBe(0);
    expect(result.task.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.task.period).toEqual({ from: '1999-09-01', to: '1999-10-31' });
  });
});

test('createTask on a taken slug is refused, naming the existing title', async () => {
  await withRollback(async (client) => {
    await createTask(client, { title: 'Premier', slug: 'x', brief: '', period: null });
    const result = await createTask(client, { title: 'Second', slug: 'x', brief: '', period: null });
    expect(result).toEqual({ kind: 'slug_taken', existingTitle: 'Premier' });
  });
});

test('getTaskDetail returns null for an unknown slug, never throws', async () => {
  await withRollback(async (client) => {
    expect(await getTaskDetail(client, 'nowhere')).toBeNull();
  });
});

test('listTasks orders the most recently opened first, nulls last', async () => {
  await withRollback(async (client) => {
    await createTask(client, { title: 'Jamais ouverte', slug: 'jamais', brief: '', period: null });
    await createTask(client, { title: 'Ouverte hier', slug: 'hier', brief: '', period: null });
    await client.query(`UPDATE app.task SET last_opened_at = now() - interval '1 day' WHERE slug = 'hier'`);

    const items = await listTasks(client);
    expect(items.map((t) => t.slug)).toEqual(['hier', 'jamais']);
  });
});

test('patchTask updates only the provided fields, and touches updated_at', async () => {
  await withRollback(async (client) => {
    await createTask(client, { title: 'Avant', slug: 'x', brief: 'brief initial', period: null });
    const patched = await patchTask(client, 'x', { title: 'Après' });
    expect(patched?.title).toBe('Après');

    const detail = await getTaskDetail(client, 'x');
    expect(detail?.brief).toBe('brief initial');
  });
});

test('patchTask on an unknown slug returns null', async () => {
  await withRollback(async (client) => {
    expect(await patchTask(client, 'nowhere', { title: 'x' })).toBeNull();
  });
});

test('patchTask can clear the period explicitly with null', async () => {
  await withRollback(async (client) => {
    await createTask(client, {
      title: 'x', slug: 'x', brief: '', period: { from: '1999-01-01', to: '1999-12-31' },
    });
    const patched = await patchTask(client, 'x', { period: null });
    expect(patched?.period).toBeNull();
  });
});

test('an image whose photo has vanished from the index is orphaned, counted, and never dropped', async () => {
  await withRollback(async (client) => {
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    await client.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position, selected_because)
                        VALUES ('x', $1, 0, '{manual}')`, ['a'.repeat(32)]);

    const detail = await getTaskDetail(client, 'x');
    expect(detail?.images).toHaveLength(1);
    expect(detail?.images[0]?.orphaned).toBe(true);
    expect(detail?.orphanCount).toBe(1);
  });
});

test('an image whose date does not overlap the task period is out of period, and it is a warning not a drop', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'folder-month',
              'album_month', '2005-06-01', '2005-06-30', 'month')`, ['a'.repeat(32), 'b'.repeat(64)]);
    await createTask(client, {
      title: 'x', slug: 'x', brief: '', period: { from: '1999-01-01', to: '1999-12-31' },
    });
    await client.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position, selected_because)
                        VALUES ('x', $1, 0, '{manual}')`, ['a'.repeat(32)]);

    const detail = await getTaskDetail(client, 'x');
    expect(detail?.images[0]?.outOfPeriod).toBe(true);
    expect(detail?.images).toHaveLength(1);
  });
});

test('an image inside the task period is not flagged', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'folder-month',
              'album_month', '1999-06-01', '1999-06-30', 'month')`, ['a'.repeat(32), 'b'.repeat(64)]);
    await createTask(client, {
      title: 'x', slug: 'x', brief: '', period: { from: '1999-01-01', to: '1999-12-31' },
    });
    await client.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position, selected_because)
                        VALUES ('x', $1, 0, '{manual}')`, ['a'.repeat(32)]);

    const detail = await getTaskDetail(client, 'x');
    expect(detail?.images[0]?.outOfPeriod).toBe(false);
  });
});

test('state is exported when the current hash matches exported_content_hash, exported_stale otherwise', async () => {
  await withRollback(async (client) => {
    const created = await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    if (created.kind !== 'created') throw new Error('setup');

    await client.query(`UPDATE app.task SET exported_at = now(), exported_content_hash = $1 WHERE slug = 'x'`,
      [created.task.contentHash]);
    expect((await getTaskDetail(client, 'x'))?.state).toBe(TaskState.EXPORTED);

    await client.query(`UPDATE app.task SET brief = $1 WHERE slug = 'x'`, ['changé après export']);
    expect((await getTaskDetail(client, 'x'))?.state).toBe(TaskState.EXPORTED_STALE);
  });
});
