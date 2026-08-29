import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import {
  loadCoversImages, loadExportDocuments, loadExportImages, loadExportTexts, loadPageImageRelpaths,
} from './export_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

test('loadExportImages returns an empty map for an empty id list, never a query', async () => {
  await withRollback(async (client) => {
    expect((await loadExportImages(client, [])).size).toBe(0);
  });
});

test('loadExportImages carries the relativePath needed to render, plus the resolved date and people', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source, album_path, group_name,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'set/x/p.jpg', 'p.jpg', 'jpg', 'folder-month', 'set/x', 'x',
              'album_month', '2000-06-01', '2000-06-30', 'month')`, [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.person (name) VALUES ('Hugo')`);
    await client.query(`INSERT INTO pipeline.photo_person (cloud_asset_id, person_name) VALUES ($1, 'Hugo')`, [id]);

    const images = await loadExportImages(client, [id]);
    const image = images.get(id);
    expect(image?.relativePath).toBe('set/x/p.jpg');
    expect(image?.format).toBe('jpg');
    expect(image?.date).toEqual({
      start: '2000-06-01', end: '2000-06-30', precision: 'month', kind: 'inference',
      source: 'album_month', bracketHours: null,
    });
    expect(image?.people).toEqual(['Hugo']);
  });
});

test('loadExportTexts returns the corrected text when a correction exists, the upstream body otherwise', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit
      (kind, id, document_id, ordinal, body, confidence, date_source, date_start, date_end,
       covers_start, covers_end, covers_rule)
      VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'Depart a cinq heures', 'transcribed',
              'log_entry_date', '1999-10-14', '1999-10-14', '1999-10-14', '1999-10-16', 'logbook_entry')`);
    await client.query(`INSERT INTO app.text_correction (text_kind, text_id, corrected_text, original_at_correction)
                        VALUES ('log_entry', 'logbook/p001/001', 'Départ à cinq heures', 'Depart a cinq heures')`);
    await client.query(`INSERT INTO pipeline.text_unit
      (kind, id, document_id, ordinal, body, confidence)
      VALUES ('passage', 'ma-vie/p007/002', 'logbook', 2, 'texte non corrigé', 'transcribed')`);

    const texts = await loadExportTexts(client, [
      { kind: 'log_entry', id: 'logbook/p001/001' }, { kind: 'passage', id: 'ma-vie/p007/002' },
    ]);
    expect(texts.get('log_entry/logbook/p001/001')?.correctedText).toBe('Départ à cinq heures');
    expect(texts.get('log_entry/logbook/p001/001')?.body).toBe('Depart a cinq heures');
    expect(texts.get('passage/ma-vie/p007/002')?.correctedText).toBeNull();
    expect(texts.get('passage/ma-vie/p007/002')?.body).toBe('texte non corrigé');
  });
});

test('loadCoversImages uses the SAME daterange && operator, restricted to the exported set only', async () => {
  await withRollback(async (client) => {
    const inWindow = 'a'.repeat(32);
    const outOfWindow = 'b'.repeat(32);
    const notExported = 'c'.repeat(32);
    for (const [id, start, end] of [
      [inWindow, '2000-06-05', '2000-06-05'], [outOfWindow, '2000-07-01', '2000-07-01'],
      [notExported, '2000-06-06', '2000-06-06'],
    ] as const) {
      await client.query(`INSERT INTO pipeline.photo
        (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
         resolved_from, resolved_start, resolved_end, resolved_precision)
        VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'folder-month', 'album_month', $3, $4, 'day')`,
        [id, id.padEnd(64, '0'), start, end]);
    }
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit
      (kind, id, document_id, ordinal, body, confidence, covers_start, covers_end, covers_rule)
      VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'x', 'transcribed',
              '2000-06-01', '2000-06-10', 'logbook_entry')`);

    const covers = await loadCoversImages(
      client, [{ kind: 'log_entry', id: 'logbook/p001/001' }], [inWindow, outOfWindow],
    );
    expect(covers.get('log_entry/logbook/p001/001')).toEqual([inWindow]);
  });
});

test('loadExportDocuments and loadPageImageRelpaths batch-fetch what buildManifest needs', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal de bord', true)`);
    await client.query(`INSERT INTO pipeline.page (id, document_id, ordinal, image_relpath, width, height)
                        VALUES ('logbook/p001', 'logbook', 1, 'journal-de-bord/p001.jpg', 810, 1250)`);

    const documents = await loadExportDocuments(client, ['logbook']);
    expect(documents.get('logbook')?.title).toBe('Journal de bord');

    const pages = await loadPageImageRelpaths(client, ['logbook/p001']);
    expect(pages.get('logbook/p001')).toBe('journal-de-bord/p001.jpg');
  });
});
