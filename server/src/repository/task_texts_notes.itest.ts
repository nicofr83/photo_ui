import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import type { PoolClient } from '../db/pool.ts';
import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import {
  createTask, createTaskNote, deleteTaskNote, getTaskDetail, mutateTaskTexts, patchTaskNote,
} from './task_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

async function insertText(client: PoolClient, documentId: string, kind: string, id: string): Promise<void> {
  await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                      VALUES ($1, 'handwritten', 'x', true) ON CONFLICT DO NOTHING`, [documentId]);
  await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                      VALUES ($1, $2, $3, 1, 'x', 'transcribed')`, [kind, id, documentId]);
}

test('mutateTaskTexts returns null for an unknown task', async () => {
  await withRollback(async (client) => {
    expect(await mutateTaskTexts(client, 'nowhere', {})).toBeNull();
  });
});

test('add is keyed by the PAIR — the same id in two kinds are two different texts', async () => {
  await withRollback(async (client) => {
    await insertText(client, 'logbook', 'passage', 'logbook/p003/001');
    await insertText(client, 'logbook', 'log_entry', 'logbook/p003/001');
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });

    const result = await mutateTaskTexts(client, 'x', {
      add: [{ kind: 'passage', id: 'logbook/p003/001' }],
    });
    expect(result?.added).toBe(1);
    expect(result?.textCount).toBe(1);

    const detail = await getTaskDetail(client, 'x');
    expect(detail?.texts).toHaveLength(1);
    expect(detail?.texts[0]?.ref).toEqual({ kind: 'passage', id: 'logbook/p003/001' });
  });
});

test('an unknown text ref is REJECTED, named with its cause', async () => {
  await withRollback(async (client) => {
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    const result = await mutateTaskTexts(client, 'x', { add: [{ kind: 'passage', id: 'nowhere/001' }] });
    expect(result?.rejected).toEqual([{ ref: { kind: 'passage', id: 'nowhere/001' }, reason: 'unknown_text' }]);
    expect(result?.added).toBe(0);
  });
});

test('re-adding an already-selected text is idempotent, not double-counted or duplicated', async () => {
  await withRollback(async (client) => {
    await insertText(client, 'logbook', 'passage', 'logbook/p001/001');
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    await mutateTaskTexts(client, 'x', { add: [{ kind: 'passage', id: 'logbook/p001/001' }] });

    const result = await mutateTaskTexts(client, 'x', { add: [{ kind: 'passage', id: 'logbook/p001/001' }] });
    expect(result?.added).toBe(0);
    expect(result?.textCount).toBe(1);
  });
});

test('remove drops the selection; removing something never selected is REJECTED not_selected', async () => {
  await withRollback(async (client) => {
    await insertText(client, 'logbook', 'passage', 'logbook/p001/001');
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    await mutateTaskTexts(client, 'x', { add: [{ kind: 'passage', id: 'logbook/p001/001' }] });

    const result = await mutateTaskTexts(client, 'x', {
      remove: [{ kind: 'passage', id: 'logbook/p001/001' }, { kind: 'log_entry', id: 'never/there' }],
    });
    expect(result?.removed).toBe(1);
    expect(result?.rejected).toEqual([{ ref: { kind: 'log_entry', id: 'never/there' }, reason: 'not_selected' }]);
  });
});

test('reorder updates order, and never touches unselected texts silently — it rejects them', async () => {
  await withRollback(async (client) => {
    await insertText(client, 'logbook', 'passage', 'logbook/p001/001');
    await insertText(client, 'logbook', 'passage', 'logbook/p002/001');
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    await mutateTaskTexts(client, 'x', {
      add: [{ kind: 'passage', id: 'logbook/p001/001' }, { kind: 'passage', id: 'logbook/p002/001' }],
    });

    const result = await mutateTaskTexts(client, 'x', {
      reorder: [
        { ref: { kind: 'passage', id: 'logbook/p002/001' }, order: 0 },
        { ref: { kind: 'passage', id: 'logbook/p001/001' }, order: 1 },
        { ref: { kind: 'log_entry', id: 'never/there' }, order: 0 },
      ],
    });
    expect(result?.rejected).toEqual([{ ref: { kind: 'log_entry', id: 'never/there' }, reason: 'not_selected' }]);

    const detail = await getTaskDetail(client, 'x');
    expect(detail?.texts[0]?.ref.id).toBe('logbook/p002/001');
    expect(detail?.texts[1]?.ref.id).toBe('logbook/p001/001');
  });
});

test('a note with no attachment on either side is a GENERAL note — empty arrays, never null', async () => {
  await withRollback(async (client) => {
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    const note = await createTaskNote(client, 'x', {
      title: 'Ce que le journal ne dit pas', text: 'x', attachedTo: { images: [], texts: [] },
    });
    expect(note?.attachedTo).toEqual({ images: [], texts: [] });
  });
});

test('createTaskNote returns null for an unknown task', async () => {
  await withRollback(async (client) => {
    const note = await createTaskNote(client, 'nowhere', { title: 'x', text: 'x', attachedTo: { images: [], texts: [] } });
    expect(note).toBeNull();
  });
});

test('patchTaskNote updates only the provided fields', async () => {
  await withRollback(async (client) => {
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    const note = await createTaskNote(client, 'x', { title: 'Avant', text: 'brief initial', attachedTo: { images: [], texts: [] } });
    const noteId = note?.id ?? '';

    const patched = await patchTaskNote(client, 'x', noteId, { title: 'Après' });
    expect(patched?.title).toBe('Après');
    expect(patched?.text).toBe('brief initial');
  });
});

test('deleting a note never touches the images/texts it was attached to', async () => {
  await withRollback(async (client) => {
    const cloudAssetId = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
                        VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'none')`, [cloudAssetId, 'b'.repeat(64)]);
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    await client.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position, selected_because)
                        VALUES ('x', $1, 0, '{manual}')`, [cloudAssetId]);
    const note = await createTaskNote(client, 'x', {
      title: 'x', text: 'x', attachedTo: { images: [cloudAssetId], texts: [] },
    });

    const deleted = await deleteTaskNote(client, 'x', note?.id ?? '');
    expect(deleted).toBe(true);

    const detail = await getTaskDetail(client, 'x');
    expect(detail?.notes).toEqual([]);
    expect(detail?.images).toHaveLength(1); // la photo sélectionnée survit à la suppression de la note
  });
});

test('deleteTaskNote returns false for an unknown note, never throws', async () => {
  await withRollback(async (client) => {
    await createTask(client, { title: 'x', slug: 'x', brief: '', period: null });
    expect(await deleteTaskNote(client, 'x', 'note_nowhere')).toBe(false);
  });
});
