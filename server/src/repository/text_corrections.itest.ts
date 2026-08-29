import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { listCorrections, listTexts, putCorrection, revertCorrection } from './text_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

test('putCorrection returns null for an unknown text ref', async () => {
  await withRollback(async (client) => {
    expect(await putCorrection(client, { ref: { kind: 'passage', id: 'nowhere/001' }, text: 'x' })).toBeNull();
  });
});

test('INVARIANT 4 — correcting a passage leaves the log_entry of the same id alone', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('passage', 'logbook/p003/001', 'logbook', 1, 'texte passage', 'transcribed'),
                               ('log_entry', 'logbook/p003/001', 'logbook', 1, 'texte journal', 'transcribed')`);

    await putCorrection(client, { ref: { kind: 'passage', id: 'logbook/p003/001' }, text: 'corrigé' });

    const { items } = await listTexts(client, { kind: 'log_entry', documentId: 'logbook' });
    expect(items[0]?.correction).toBeNull();
    expect(items[0]?.text).toBe(items[0]?.textOriginal);
    expect(items[0]?.text).toBe('texte journal');
  });
});

test('the drift witness is stored at correction time — the CURRENT upstream body', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'Depart a cinq heures', 'transcribed')`);

    await putCorrection(client, { ref: { kind: 'log_entry', id: 'logbook/p001/001' }, text: 'Départ à cinq heures' });

    const { rows } = await client.query<{ original_at_correction: string }>(
      `SELECT original_at_correction FROM app.text_correction WHERE text_kind = 'log_entry' AND text_id = 'logbook/p001/001'`);
    expect(rows[0]?.original_at_correction).toBe('Depart a cinq heures');
  });
});

test('a second correction updates in place, and the witness stays the UPSTREAM text, not the previous correction', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'amont', 'transcribed')`);

    await putCorrection(client, { ref: { kind: 'log_entry', id: 'logbook/p001/001' }, text: 'premiere correction' });
    const unit = await putCorrection(client, { ref: { kind: 'log_entry', id: 'logbook/p001/001' }, text: 'seconde correction' });
    expect(unit?.text).toBe('seconde correction');

    const { rows } = await client.query<{ original_at_correction: string }>(
      `SELECT original_at_correction FROM app.text_correction WHERE text_kind = 'log_entry' AND text_id = 'logbook/p001/001'`);
    expect(rows[0]?.original_at_correction).toBe('amont');
  });
});

test('search finds the CORRECTED text, not the upstream transcription alone', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'texte amont', 'transcribed')`);

    await putCorrection(client, { ref: { kind: 'log_entry', id: 'logbook/p001/001' }, text: 'un mot introuvable ailleurs: xylophone' });

    expect((await listTexts(client, { q: 'xylophone' })).total).toBe(1);
  });
});

test('revertCorrection removes the correction, the text falls back to the upstream body', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'amont', 'transcribed')`);
    await putCorrection(client, { ref: { kind: 'log_entry', id: 'logbook/p001/001' }, text: 'corrigé' });

    const reverted = await revertCorrection(client, { kind: 'log_entry', id: 'logbook/p001/001' });
    expect(reverted?.text).toBe('amont');
    expect(reverted?.correction).toBeNull();
  });
});

test('revertCorrection returns null for an unknown text ref', async () => {
  await withRollback(async (client) => {
    expect(await revertCorrection(client, { kind: 'log_entry', id: 'nowhere/001' })).toBeNull();
  });
});

test('listCorrections filters by status — applied by default (upstream unchanged since correction)', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'amont', 'transcribed')`);
    await putCorrection(client, { ref: { kind: 'log_entry', id: 'logbook/p001/001' }, text: 'corrigé' });

    const applied = await listCorrections(client, 'applied');
    expect(applied).toHaveLength(1);
    expect(applied[0]?.status).toBe('applied');
  });
});

test('listCorrections marks needs_review when the upstream text has moved since the correction', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'amont v1', 'transcribed')`);
    await putCorrection(client, { ref: { kind: 'log_entry', id: 'logbook/p001/001' }, text: 'corrigé' });

    // Une re-dérivation de documents.db a changé la transcription amont —
    // la correction est CONSERVÉE, jamais appliquée en silence ni supprimée.
    await client.query(`UPDATE pipeline.text_unit SET body = 'amont v2' WHERE kind = 'log_entry' AND id = 'logbook/p001/001'`);

    const needsReview = await listCorrections(client, 'needs_review');
    expect(needsReview).toHaveLength(1);
    expect(needsReview[0]?.text).toBe('corrigé');
  });
});

test('listCorrections marks orphaned when the target no longer exists at all', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'amont', 'transcribed')`);
    await putCorrection(client, { ref: { kind: 'log_entry', id: 'logbook/p001/001' }, text: 'corrigé' });

    // Le texte a disparu (page recoupée à l'import) : la correction n'a plus de cible.
    await client.query(`DELETE FROM pipeline.text_unit WHERE kind = 'log_entry' AND id = 'logbook/p001/001'`);

    const orphaned = await listCorrections(client, 'orphaned');
    expect(orphaned).toHaveLength(1);
    expect(orphaned[0]?.status).toBe('orphaned');
  });
});

test('listCorrections with no status returns every correction, regardless of status', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'a', 'transcribed'),
                               ('log_entry', 'logbook/p001/002', 'logbook', 2, 'b', 'transcribed')`);
    await putCorrection(client, { ref: { kind: 'log_entry', id: 'logbook/p001/001' }, text: 'x' });
    await putCorrection(client, { ref: { kind: 'log_entry', id: 'logbook/p001/002' }, text: 'y' });
    await client.query(`DELETE FROM pipeline.text_unit WHERE id = 'logbook/p001/002'`);

    expect(await listCorrections(client, undefined)).toHaveLength(2);
  });
});
