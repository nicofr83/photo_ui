import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { must } from '../../test/helpers/assert.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { buildImportFixture } from '../../test/helpers/import_fixture.ts';
import { runImportInto } from '../import/import_service.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

const id = (c: string): string => c.repeat(32);

test('INVARIANT 5 — a re-import does not lose one row of human work', async () => {
  await withRollback(async (client) => {
    const sources = await buildImportFixture();
    await runImportInto(client, sources);   // une première fois : la photo id('a') existe

    await client.query(`INSERT INTO app.task (slug, title) VALUES ('transat', 'La transat')`);
    await client.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position, selected_because)
                        VALUES ('transat', $1, 1, ARRAY['manual'])`, [id('a')]);
    await client.query(`INSERT INTO app.text_correction
      (text_kind, text_id, corrected_text, original_at_correction)
      VALUES ('passage', 'logbook/p001/001', 'corrigé', 'la prose du haut de page')`);
    await client.query(`INSERT INTO app.photo_caption (sha256, caption, model, prompt_version)
      VALUES ($1, 'une légende', 'claude-haiku-4-5', 'v1')`, [id('a')]);

    await runImportInto(client, sources);   // réimport : rien de ceci ne doit bouger

    for (const [table, expected] of [
      ['app.task', 1], ['app.task_image', 1], ['app.text_correction', 1], ['app.photo_caption', 1],
    ] as const) {
      const { rows } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
      expect(must(rows[0]).n, `${table} a perdu des lignes`).toBe(expected);
    }
  });
});

test('an orphaned image selection is MARKED in the report, never deleted', async () => {
  await withRollback(async (client) => {
    const sources = await buildImportFixture();
    await client.query(`INSERT INTO app.task (slug, title) VALUES ('t', 'T')`);
    // 'f'.repeat(32) désigne bien une photo (id('f')) qui EXISTE dans le jeu
    // d'essai : l'orpheline doit être une photo absente de l'index.
    const missing = 'z'.repeat(32);
    await client.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position)
                        VALUES ('t', $1, 1)`, [missing]);

    const report = await runImportInto(client, sources);

    expect(report.orphanedImageSelections).toEqual([{ taskSlug: 't', cloudAssetId: missing }]);
    const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM app.task_image');
    expect(must(rows[0]).n).toBe(1);
  });
});

test('an orphaned text selection is MARKED, and the pair (kind, id) both travel', async () => {
  await withRollback(async (client) => {
    const sources = await buildImportFixture();
    await client.query(`INSERT INTO app.task (slug, title) VALUES ('t', 'T')`);
    await client.query(`INSERT INTO app.task_text (task_slug, text_kind, text_id, position)
                        VALUES ('t', 'passage', 'ma-vie/p999/001', 1)`);

    const report = await runImportInto(client, sources);

    expect(report.orphanedTextSelections)
      .toEqual([{ taskSlug: 't', textKind: 'passage', textId: 'ma-vie/p999/001' }]);
  });
});

test('a correction whose upstream text moved is flagged needs_review, not applied', async () => {
  await withRollback(async (client) => {
    const sources = await buildImportFixture();
    await client.query(`INSERT INTO app.text_correction
      (text_kind, text_id, corrected_text, original_at_correction)
      VALUES ('passage', 'logbook/p001/001', 'ma correction', 'un texte qui a depuis bougé')`);

    const report = await runImportInto(client, sources);

    expect(report.correctionsNeedingReview).toContainEqual({ kind: 'passage', id: 'logbook/p001/001' });
  });
});

test('a correction on a text that vanished entirely is ALSO flagged, not silently dropped', async () => {
  await withRollback(async (client) => {
    const sources = await buildImportFixture();
    await client.query(`INSERT INTO app.text_correction
      (text_kind, text_id, corrected_text, original_at_correction)
      VALUES ('passage', 'ma-vie/p999/001', 'ma correction', 'nimporte quoi')`);

    const report = await runImportInto(client, sources);

    expect(report.correctionsNeedingReview).toContainEqual({ kind: 'passage', id: 'ma-vie/p999/001' });
  });
});

test('INVARIANT 6 — no foreign key from app or ref ever reaches into pipeline, even after import', async () => {
  await withRollback(async (client) => {
    await runImportInto(client, await buildImportFixture());
    const { rows } = await client.query(`
      SELECT c.conname FROM pg_constraint c
        JOIN pg_class tf ON tf.oid = c.conrelid
        JOIN pg_namespace sf ON sf.oid = tf.relnamespace
        JOIN pg_class tt ON tt.oid = c.confrelid
        JOIN pg_namespace st ON st.oid = tt.relnamespace
       WHERE c.contype = 'f' AND sf.nspname IN ('app', 'ref') AND st.nspname = 'pipeline'`);
    expect(rows).toEqual([]);
  });
});
