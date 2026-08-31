import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import type { PoolClient } from '../db/pool.ts';
import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { createTask, deleteTask, getTaskDetail, mutateTaskImages } from './task_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

async function insertPhoto(
  client: PoolClient, cloudAssetId: string, start = '2000-06-01', end = '2000-06-30',
): Promise<void> {
  await client.query(`INSERT INTO pipeline.photo
    (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
     resolved_from, resolved_start, resolved_end, resolved_precision)
    VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'folder-month', 'album_month', $3, $4, 'month')`,
    [cloudAssetId, cloudAssetId.padEnd(64, '0'), start, end]);
}

test('mutateTaskImages returns null for an unknown task', async () => {
  await withRollback(async (client) => {
    expect(await mutateTaskImages(client, 'nowhere', {})).toBeNull();
  });
});

test('selected_because is ADDITIVE — a second gesture never erases the first', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await insertPhoto(client, id);
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });

    await mutateTaskImages(client, 'x', { add: [{ cloudAssetId: id, selectedBecause: ['album'] }] });
    await mutateTaskImages(client, 'x', { add: [{ cloudAssetId: id, selectedBecause: ['search'] }] });

    const detail = await getTaskDetail(client, 'x');
    expect([...(detail?.images[0]?.selectedBecause ?? [])].sort()).toEqual(['album', 'search']);
  });
});

test('an already-selected photo is MERGED, not rejected', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await insertPhoto(client, id);
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    await mutateTaskImages(client, 'x', { add: [{ cloudAssetId: id, selectedBecause: ['album'] }] });

    const result = await mutateTaskImages(client, 'x', { add: [{ cloudAssetId: id, selectedBecause: ['manual'] }] });
    expect(result?.merged).toBe(1);
    expect(result?.added).toBe(0);
    expect(result?.rejected).toEqual([]);
  });
});

test('writing a note selects the photo IMPLICITLY, and says so — never silently', async () => {
  await withRollback(async (client) => {
    const fresh = 'a'.repeat(32);
    await insertPhoto(client, fresh);
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });

    const result = await mutateTaskImages(client, 'x', { update: [{ cloudAssetId: fresh, note: 'Hugo à la barre' }] });
    expect(result?.implicitlyAdded).toEqual([fresh]);
    expect(result?.updated).toBe(1);

    const detail = await getTaskDetail(client, 'x');
    expect(detail?.images[0]?.note).toBe('Hugo à la barre');
    expect(detail?.images[0]?.selectedBecause).toEqual(['manual']);
  });
});

test('an out-of-period photo is ACCEPTED with a warning — a warning is not a rejection', async () => {
  await withRollback(async (client) => {
    const photo2005 = 'a'.repeat(32);
    await insertPhoto(client, photo2005, '2005-06-01', '2005-06-30');
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: { from: '1999-01-01', to: '1999-12-31' } });

    const result = await mutateTaskImages(client, 'x', {
      add: [{ cloudAssetId: photo2005, selectedBecause: ['manual'] }],
    });
    expect(result?.warnings).toContainEqual({ cloudAssetId: photo2005, code: 'out_of_period' });
    expect(result?.rejected).toEqual([]);
  });
});

test('an unknown photo is REJECTED, named with its cause — never a silent failure', async () => {
  await withRollback(async (client) => {
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    const result = await mutateTaskImages(client, 'x', {
      add: [{ cloudAssetId: 'z'.repeat(32), selectedBecause: ['manual'] }],
    });
    expect(result?.rejected).toEqual([{ cloudAssetId: 'z'.repeat(32), reason: 'unknown_photo' }]);
    expect(result?.added).toBe(0);
  });
});

test('remove drops the selection and is counted, an unselected id is rejected not_selected', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await insertPhoto(client, id);
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    await mutateTaskImages(client, 'x', { add: [{ cloudAssetId: id, selectedBecause: ['manual'] }] });

    const result = await mutateTaskImages(client, 'x', { remove: [id, 'b'.repeat(32)] });
    expect(result?.removed).toBe(1);
    expect(result?.rejected).toEqual([{ cloudAssetId: 'b'.repeat(32), reason: 'not_selected' }]);

    const detail = await getTaskDetail(client, 'x');
    expect(detail?.images).toEqual([]);
  });
});

test('updating an already-orphaned selection still applies, with a warning naming it', async () => {
  await withRollback(async (client) => {
    const ghost = 'a'.repeat(32);
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    // Sélectionné directement en base : le pipeline a été reconstruit depuis, la photo a disparu.
    await client.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position, selected_because)
                        VALUES ('x', $1, 0, '{manual}')`, [ghost]);

    const result = await mutateTaskImages(client, 'x', { update: [{ cloudAssetId: ghost, note: 'toujours là' }] });
    expect(result?.warnings).toContainEqual({ cloudAssetId: ghost, code: 'orphaned' });
    expect(result?.implicitlyAdded).toEqual([]);
  });
});

test('add, remove and update in the SAME call, one transaction, contentHash reflects the end state', async () => {
  await withRollback(async (client) => {
    const keep = 'a'.repeat(32);
    const drop = 'b'.repeat(32);
    const noted = 'c'.repeat(32);
    await insertPhoto(client, keep);
    await insertPhoto(client, drop);
    await insertPhoto(client, noted);
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    await mutateTaskImages(client, 'x', {
      add: [
        { cloudAssetId: keep, selectedBecause: ['album'] },
        { cloudAssetId: drop, selectedBecause: ['album'] },
      ],
    });

    const result = await mutateTaskImages(client, 'x', {
      remove: [drop],
      update: [{ cloudAssetId: noted, note: 'une note' }],
    });
    expect(result?.removed).toBe(1);
    expect(result?.implicitlyAdded).toEqual([noted]);
    expect(result?.imageCount).toBe(2);

    const detail = await getTaskDetail(client, 'x');
    expect([...(detail?.images.map((i) => i.cloudAssetId) ?? [])].sort()).toEqual([keep, noted].sort());
    expect(detail?.contentHash).toBe(result?.contentHash);
  });
});

// V1.7 — migration 008 : removing an image used to hard-delete its note
// (zz-repro-bug1, found by `front`); reselecting started from `note: null`.
test('a removed image\'s note is preserved and comes back VERBATIM on reselection', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await insertPhoto(client, id);
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    await mutateTaskImages(client, 'x', {
      add: [{ cloudAssetId: id, selectedBecause: ['manual'], note: 'un commentaire' }],
    });

    await mutateTaskImages(client, 'x', { remove: [id] });
    const afterRemoval = await getTaskDetail(client, 'x');
    expect(afterRemoval?.images).toEqual([]); // retirée pour de vrai — pas juste masquée

    await mutateTaskImages(client, 'x', { add: [{ cloudAssetId: id, selectedBecause: ['manual'] }] });
    const afterReselection = await getTaskDetail(client, 'x');
    expect(afterReselection?.images[0]?.note).toBe('un commentaire');
  });
});

test('reselecting WITH an explicit note overrides the preserved one, never silently ignored', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await insertPhoto(client, id);
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    await mutateTaskImages(client, 'x', { add: [{ cloudAssetId: id, selectedBecause: ['manual'], note: 'ancien' }] });
    await mutateTaskImages(client, 'x', { remove: [id] });

    await mutateTaskImages(client, 'x', {
      add: [{ cloudAssetId: id, selectedBecause: ['manual'], note: 'nouveau' }],
    });
    const detail = await getTaskDetail(client, 'x');
    expect(detail?.images[0]?.note).toBe('nouveau');
  });
});

test('removing an image that never had a note restores nothing on reselection — never a stale note from further back', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await insertPhoto(client, id);
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    await mutateTaskImages(client, 'x', { add: [{ cloudAssetId: id, selectedBecause: ['manual'] }] });
    await mutateTaskImages(client, 'x', { remove: [id] });

    await mutateTaskImages(client, 'x', { add: [{ cloudAssetId: id, selectedBecause: ['manual'] }] });
    const detail = await getTaskDetail(client, 'x');
    expect(detail?.images[0]?.note).toBeNull();
  });
});

test('clearing a note (update note:null) THEN removing preserves nothing — the archive reflects the note as it stood at removal, never an older one', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await insertPhoto(client, id);
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    await mutateTaskImages(client, 'x', { add: [{ cloudAssetId: id, selectedBecause: ['manual'], note: 'un commentaire' }] });
    await mutateTaskImages(client, 'x', { update: [{ cloudAssetId: id, note: null }] });
    await mutateTaskImages(client, 'x', { remove: [id] });

    await mutateTaskImages(client, 'x', { add: [{ cloudAssetId: id, selectedBecause: ['manual'] }] });
    const detail = await getTaskDetail(client, 'x');
    expect(detail?.images[0]?.note).toBeNull();
  });
});

test('a note preserved across a remove/reselect round trip never moves contentHash — an inert note is invisible to it', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await insertPhoto(client, id);
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    const before = await mutateTaskImages(client, 'x', {
      add: [{ cloudAssetId: id, selectedBecause: ['manual'], note: 'un commentaire' }],
    });

    await mutateTaskImages(client, 'x', { remove: [id] });
    const after = await mutateTaskImages(client, 'x', { add: [{ cloudAssetId: id, selectedBecause: ['manual'] }] });

    // Même sélection, même note, retrouvée à l'identique : le hash retombe
    // exactement là où il était — la table d'attente n'existe nulle part
    // dans son calcul (`getTaskDetail`/`content_hash.ts` ne la lisent pas).
    expect(after?.contentHash).toBe(before?.contentHash);
  });
});

test('a note left in waiting for a removed image is purged when the task itself is deleted, same as everything else', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await insertPhoto(client, id);
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    await mutateTaskImages(client, 'x', { add: [{ cloudAssetId: id, selectedBecause: ['manual'], note: 'un commentaire' }] });
    await mutateTaskImages(client, 'x', { remove: [id] });

    await deleteTask(client, 'x');
    const { rows } = await client.query(`SELECT 1 FROM app.task_image_note WHERE task_slug = 'x'`);
    expect(rows).toEqual([]);
  });
});
