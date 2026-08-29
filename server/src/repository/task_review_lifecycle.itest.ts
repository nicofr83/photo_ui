import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import type { TaskReview } from '../contract/task_interface.ts';
import { countAlbumsWithPresumedSpan } from './album_repository.ts';
import { countWebDocumentsWithoutSpan } from './text_repository.ts';
import { countOrphanedSelections, deleteTask, duplicateTask, getTaskReview } from './task_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

test('getTaskReview returns null for an unknown slug', async () => {
  await withRollback(async (client) => {
    expect(await getTaskReview(client, 'nowhere')).toBeNull();
  });
});

test('getTaskReview: the eight counters, images/texts arrays, and the timeline', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO app.task (slug, title, brief) VALUES ('t1', 'T1', '')`);

    // a — datée par son album (inference), aucun texte ne la recouvre.
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ('${'a'.repeat(32)}', '${'1'.repeat(64)}', 'x/a.jpg', 'a.jpg', 'jpg', 'folder-month',
              'album_month', '1999-06-01', '1999-06-30', 'month')`);
    // b — non datée.
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
      VALUES ('${'b'.repeat(32)}', '${'2'.repeat(64)}', 'x/b.jpg', 'b.jpg', 'jpg', 'none')`);
    // c — tranchée par une annotation (decision), recouverte par le passage p1.
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ('${'c'.repeat(32)}', '${'3'.repeat(64)}', 'x/c.jpg', 'c.jpg', 'jpg', 'exif',
              'annotation', '2000-01-01', '2000-01-01', 'day')`);

    await client.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position, selected_because)
      VALUES ('t1', '${'a'.repeat(32)}', 1, '{}'), ('t1', '${'b'.repeat(32)}', 2, '{}'),
             ('t1', '${'c'.repeat(32)}', 3, '{}')`);
    // d — orphelin : sélectionné, disparu de pipeline.photo.
    await client.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position, selected_because)
      VALUES ('t1', '${'d'.repeat(32)}', 4, '{}')`);

    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('doc', 'handwritten', 'Doc', false)`);
    // p1 — recouvre c (fenêtre étroite).
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence, covers_start, covers_end, covers_rule)
      VALUES ('passage', 'doc/p1', 'doc', 1, 'p1', 'transcribed', '2000-01-01', '2000-01-01', 'passage')`);
    // p2 — confiance incertaine, aucun recouvrement.
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
      VALUES ('passage', 'doc/p2', 'doc', 2, 'p2', 'uncertain')`);
    // p3 — fenêtre de recouvrement large (41 jours), transcrite.
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence, covers_start, covers_end, covers_rule)
      VALUES ('passage', 'doc/p3', 'doc', 3, 'p3', 'transcribed', '2001-01-01', '2001-02-10', 'passage')`);

    await client.query(`INSERT INTO app.task_text (task_slug, text_kind, text_id, position)
      VALUES ('t1', 'passage', 'doc/p1', 1), ('t1', 'passage', 'doc/p2', 2), ('t1', 'passage', 'doc/p3', 3)`);
    // orpheline : sélectionnée, disparue de pipeline.text_unit.
    await client.query(`INSERT INTO app.task_text (task_slug, text_kind, text_id, position)
      VALUES ('t1', 'passage', 'doc/nowhere', 4)`);

    const review = await getTaskReview(client, 't1');
    expect(review).not.toBeNull();
    const r = review as TaskReview;

    expect(r.images.map((i) => i.cloudAssetId).sort()).toEqual(['a', 'b', 'c'].map((c) => c.repeat(32)).sort());
    expect(r.texts.map((t) => t.ref.id).sort()).toEqual(['doc/p1', 'doc/p2', 'doc/p3']);

    expect(r.warnings).toEqual({
      undatedImages: 1,
      inferredDateImages: 1,
      uncertainTexts: 1,
      textsWiderThan30Days: 1,
      imagesWithoutText: 2,
      orphanedImages: 1,
      orphanedTexts: 1,
      imagesOutOfPeriod: 0,
    });

    expect(r.timeline).toEqual([
      { kind: 'image', id: 'a'.repeat(32), start: '1999-06-01', end: '1999-06-30', precision: 'month', dateKind: 'inference' },
      { kind: 'image', id: 'c'.repeat(32), start: '2000-01-01', end: '2000-01-01', precision: 'day', dateKind: 'decision' },
    ]);
  });
});

test('getTaskReview: imagesOutOfPeriod counts a selected image outside the task period', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO app.task (slug, title, brief, period_from, period_to)
      VALUES ('t2', 'T2', '', '2005-01-01', '2005-01-31')`);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ('${'e'.repeat(32)}', '${'4'.repeat(64)}', 'x/e.jpg', 'e.jpg', 'jpg', 'exif',
              'annotation', '2009-09-09', '2009-09-09', 'day')`);
    await client.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position, selected_because)
      VALUES ('t2', '${'e'.repeat(32)}', 1, '{}')`);

    const review = await getTaskReview(client, 't2');
    expect(review?.warnings.imagesOutOfPeriod).toBe(1);
  });
});

test('getTaskReview: notes travel through, same shape as TaskDetail', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO app.task (slug, title, brief) VALUES ('t3', 'T3', '')`);
    await client.query(`INSERT INTO app.task_note (id, task_slug, title, body) VALUES ('note_x', 't3', 'Titre', 'Corps')`);

    const review = await getTaskReview(client, 't3');
    const note = review?.notes[0];
    expect(note).toMatchObject({ id: 'note_x', title: 'Titre', text: 'Corps', attachedTo: { images: [], texts: [] } });
    // `createdAt`/`updatedAt` : `timestamptz`, non converti en chaîne par ce
    // pool (seuls `date` et `timestamp` le sont, `db/pool.ts`) — la sérialisation
    // JSON s'en charge à la frontière HTTP, jamais franchie par cet appel direct.
    expect(note?.createdAt).toBeTruthy();
    expect(note?.updatedAt).toBeTruthy();
  });
});

test('deleteTask returns null for an unknown slug', async () => {
  await withRollback(async (client) => {
    expect(await deleteTask(client, 'nowhere')).toBeNull();
  });
});

test('deleteTask never touches an already-exported folder, and names it', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO app.task (slug, title, brief, exported_at, export_directory)
      VALUES ('t4', 'T4', '', now(), '/tasks/t4')`);
    await client.query(`INSERT INTO app.task_note (id, task_slug, title, body) VALUES ('note_x', 't4', '', 'x')`);

    const result = await deleteTask(client, 't4');
    expect(result).toEqual({ deleted: true, exportDirectoryKept: '/tasks/t4' });

    const { rows } = await client.query(`SELECT 1 FROM app.task WHERE slug = 't4'`);
    expect(rows).toHaveLength(0);
    // ON DELETE CASCADE — la note disparaît avec la tâche.
    const notes = await client.query(`SELECT 1 FROM app.task_note WHERE task_slug = 't4'`);
    expect(notes.rows).toHaveLength(0);
  });
});

test('deleteTask on a task never exported: exportDirectoryKept is null', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO app.task (slug, title, brief) VALUES ('t5', 'T5', '')`);
    expect(await deleteTask(client, 't5')).toEqual({ deleted: true, exportDirectoryKept: null });
  });
});

test('duplicateTask: source_not_found for an unknown slug', async () => {
  await withRollback(async (client) => {
    expect(await duplicateTask(client, 'nowhere', { title: 'x', slug: 'x' })).toEqual({ kind: 'source_not_found' });
  });
});

test('duplicateTask: slug_taken names the existing title', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO app.task (slug, title, brief) VALUES ('src', 'Source', '')`);
    await client.query(`INSERT INTO app.task (slug, title, brief) VALUES ('taken', 'Déjà pris', '')`);
    expect(await duplicateTask(client, 'src', { title: 'x', slug: 'taken' }))
      .toEqual({ kind: 'slug_taken', existingTitle: 'Déjà pris' });
  });
});

test('duplicateTask: copies brief/period/images/texts/notes, never the export state', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO app.task
        (slug, title, brief, period_from, period_to, exported_at, export_directory, exported_content_hash)
        VALUES ('src', 'La transat', 'un brief', '1999-01-01', '1999-12-31', now(), '/tasks/src', 'deadbeef')`);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
      VALUES ('${'a'.repeat(32)}', '${'1'.repeat(64)}', 'x/a.jpg', 'a.jpg', 'jpg', 'none')`);
    await client.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position, note, selected_because)
      VALUES ('src', '${'a'.repeat(32)}', 1, 'une note', '{manual}')`);
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('doc', 'handwritten', 'Doc', false)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
      VALUES ('passage', 'doc/p1', 'doc', 1, 'p1', 'transcribed')`);
    await client.query(`INSERT INTO app.task_text (task_slug, text_kind, text_id, position, start_offset, end_offset)
      VALUES ('src', 'passage', 'doc/p1', 1, 3, 9)`);
    await client.query(`INSERT INTO app.task_note (id, task_slug, title, body) VALUES ('note_src', 'src', 'Note', 'Corps')`);
    await client.query(`INSERT INTO app.task_note_image (note_id, cloud_asset_id) VALUES ('note_src', '${'a'.repeat(32)}')`);
    await client.query(`INSERT INTO app.task_note_text (note_id, text_kind, text_id) VALUES ('note_src', 'passage', 'doc/p1')`);

    const result = await duplicateTask(client, 'src', { title: 'La transat, v2', slug: 'src-v2' });
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') throw new Error('unreachable');

    expect(result.task.title).toBe('La transat, v2');
    expect(result.task.brief).toBe('un brief');
    expect(result.task.period).toEqual({ from: '1999-01-01', to: '1999-12-31' });
    expect(result.task.state).toBe('draft');
    expect(result.task.exportedAt).toBeNull();
    expect(result.task.exportDirectory).toBeNull();
    expect(result.task.images).toHaveLength(1);
    expect(result.task.images[0]).toMatchObject({ cloudAssetId: 'a'.repeat(32), note: 'une note', selectedBecause: ['manual'] });
    expect(result.task.texts).toHaveLength(1);
    expect(result.task.texts[0]).toMatchObject({ ref: { kind: 'passage', id: 'doc/p1' }, startOffset: 3, endOffset: 9 });
    expect(result.task.notes).toHaveLength(1);
    expect(result.task.notes[0]).toMatchObject({
      title: 'Note', text: 'Corps',
      attachedTo: { images: ['a'.repeat(32)], texts: [{ kind: 'passage', id: 'doc/p1' }] },
    });
    // Le note_id neuf n'est pas celui de la source — un ULID frais, pas une copie de clé.
    expect(result.task.notes[0]?.id).not.toBe('note_src');

    // La source reste intacte, elle, exportée.
    const { rows: sourceRows } = await client.query<{ exported_at: string | null }>(
      `SELECT exported_at FROM app.task WHERE slug = 'src'`);
    expect(sourceRows[0]?.exported_at).not.toBeNull();
  });
});

test('countOrphanedSelections is GLOBAL — sums across every task, images and texts both', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO app.task (slug, title, brief) VALUES ('t6', 'T6', ''), ('t7', 'T7', '')`);
    // Deux images orphelines dans deux tâches différentes, une texte orpheline dans une troisième sélection.
    await client.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position, selected_because)
      VALUES ('t6', '${'a'.repeat(32)}', 1, '{}'), ('t7', '${'b'.repeat(32)}', 1, '{}')`);
    await client.query(`INSERT INTO app.task_text (task_slug, text_kind, text_id, position)
      VALUES ('t6', 'passage', 'doc/nowhere', 1)`);

    expect(await countOrphanedSelections(client)).toBe(3);
  });
});

test('countOrphanedSelections is 0 when a selection resolves to a real photo/text', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO app.task (slug, title, brief) VALUES ('t8', 'T8', '')`);
    await client.query(`INSERT INTO pipeline.photo (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
      VALUES ('${'a'.repeat(32)}', '${'1'.repeat(64)}', 'x/a.jpg', 'a.jpg', 'jpg', 'none')`);
    await client.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position, selected_because)
      VALUES ('t8', '${'a'.repeat(32)}', 1, '{}')`);

    expect(await countOrphanedSelections(client)).toBe(0);
  });
});

test('countAlbumsWithPresumedSpan counts in-perimeter albums with a presumed span, and only those', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.album (path, album_name, in_perimeter, span_from, span_to, span_presumed)
      VALUES ('set/presumed', 'x', true, '1999-01-01', '1999-01-31', true),
             ('set/saisi', 'y', true, '1999-02-01', '1999-02-28', false),
             ('set/out-of-perimeter', 'z', false, '1999-03-01', '1999-03-31', true)`);

    expect(await countAlbumsWithPresumedSpan(client)).toBe(1);
  });
});

test('countWebDocumentsWithoutSpan counts html documents missing a ref.web_span row, never handwritten ones', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES
      ('site/no-span', 'html', 'x', false), ('site/has-span', 'html', 'y', false), ('logbook', 'handwritten', 'z', true)`);
    await client.query(`INSERT INTO ref.web_span (document_id, date_from, date_to) VALUES ('site/has-span', '2003-01-01', '2003-01-31')`);

    expect(await countWebDocumentsWithoutSpan(client)).toBe(1);
  });
});
