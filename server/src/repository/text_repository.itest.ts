import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { getPageImageRelpath, listDocuments, listPages, listTexts } from './text_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

test('the KEY is the pair — the same id in both namespaces is two different texts', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.page (id, document_id, ordinal, image_relpath, width, height)
                        VALUES ('logbook/p003', 'logbook', 3, 'logbook/p003.jpg', 810, 1250)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, page_id, ordinal, body, confidence)
                        VALUES ('passage', 'logbook/p003/001', 'logbook', 'logbook/p003', 1, 'texte passage', 'transcribed'),
                               ('log_entry', 'logbook/p003/001', 'logbook', 'logbook/p003', 1, 'texte journal', 'transcribed')`);

    const passages = await listTexts(client, { pageId: 'logbook/p003', kind: 'passage' });
    const entries = await listTexts(client, { pageId: 'logbook/p003', kind: 'log_entry' });
    expect(passages.items[0]?.text).toBe('texte passage');
    expect(entries.items[0]?.text).toBe('texte journal');
    expect(passages.items[0]?.text).not.toBe(entries.items[0]?.text);
  });
});

test('text and textOriginal are ALWAYS both present — never one without the other', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'transcription amont', 'transcribed')`);

    const { items } = await listTexts(client, {});
    expect(items[0]?.text).toEqual(expect.any(String));
    expect(items[0]?.textOriginal).toEqual(expect.any(String));
    expect(items[0]?.textOriginal).toBe('transcription amont');
  });
});

test('a correction replaces text but textOriginal keeps the upstream transcription', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'Depart a cinq heures', 'transcribed')`);
    await client.query(`INSERT INTO app.text_correction (text_kind, text_id, corrected_text, original_at_correction)
                        VALUES ('log_entry', 'logbook/p001/001', 'Départ à cinq heures', 'Depart a cinq heures')`);

    const { items } = await listTexts(client, {});
    expect(items[0]?.text).toBe('Départ à cinq heures');
    expect(items[0]?.textOriginal).toBe('Depart a cinq heures');
    expect(items[0]?.correction?.status).toBe('applied');
  });
});

test('pageSpanSource travels on the text so `carried` stays visible without loading the page', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('ma-vie', 'handwritten', 'Ma vie', true)`);
    await client.query(`INSERT INTO pipeline.text_unit
      (kind, id, document_id, ordinal, body, confidence, page_span_source)
      VALUES ('passage', 'ma-vie/p007/002', 'ma-vie', 1, 'x', 'transcribed', 'carried')`);

    const { items } = await listTexts(client, {});
    expect(items[0]?.pageSpanSource).toBe('carried');
  });
});

test('a page image path comes from the COLUMN, never rebuilt from documentId — three spellings coexist', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.page (id, document_id, ordinal, image_relpath, width, height)
                        VALUES ('logbook/p001', 'logbook', 1, 'journal-de-bord/p001.jpg', 810, 1250)`);

    expect(await getPageImageRelpath(client, 'logbook/p001')).toBe('journal-de-bord/p001.jpg');
    const pages = await listPages(client, 'logbook');
    expect(pages[0]?.imageUrl).toBe('/pages/image?pageId=logbook%2Fp001');
  });
});

test('regionsAvailable is false — pages.region carries no data (contract §4.3)', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.page (id, document_id, ordinal, image_relpath, width, height)
                        VALUES ('logbook/p001', 'logbook', 1, 'p001.jpg', 810, 1250)`);

    const pages = await listPages(client, 'logbook');
    expect(pages[0]?.regionsAvailable).toBe(false);
  });
});

test('listDocuments carries the ref.web_span as an inference, never null when a span was entered', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('web/1999/Transat', 'html', 'La transat', false)`);
    await client.query(`INSERT INTO ref.web_span (document_id, date_from, date_to)
                        VALUES ('web/1999/Transat', '1999-09-01', '1999-11-30')`);

    const documents = await listDocuments(client);
    const doc = documents.find((d) => d.id === 'web/1999/Transat');
    expect(doc?.span).toEqual({
      start: '1999-09-01', end: '1999-11-30', precision: 'day', kind: 'inference', source: 'web_span',
      bracketHours: null,
    });
  });
});

test('a document with no web_span entered has a null span, never an invented one', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('web/2000/Autre', 'html', 'Autre', false)`);
    const documents = await listDocuments(client);
    expect(documents.find((d) => d.id === 'web/2000/Autre')?.span).toBeNull();
  });
});

test('overlappingPhotoCount uses the SAME && predicate as GET /photos overlap filtering', async () => {
  await withRollback(async (client) => {
    const inWindow = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'folder-month', 'album_month', '2000-06-05', '2000-06-05', 'day')`,
      [inWindow, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit
      (kind, id, document_id, ordinal, body, confidence, covers_start, covers_end, covers_rule)
      VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'x', 'transcribed', '2000-06-01', '2000-06-10', 'logbook_entry')`);

    const { items } = await listTexts(client, {});
    expect(items[0]?.overlappingPhotoCount).toBe(1);
  });
});

test('overlapsPhoto filters texts to those covering the given photo, using the same predicate', async () => {
  await withRollback(async (client) => {
    const covered = 'a'.repeat(32);
    const notCovered = 'b'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'folder-month', 'album_month', '2000-06-05', '2000-06-05', 'day')`,
      [covered, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/p2.jpg', 'p2.jpg', 'jpg', 'folder-month', 'album_month', '2001-06-05', '2001-06-05', 'day')`,
      [notCovered, 'c'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit
      (kind, id, document_id, ordinal, body, confidence, covers_start, covers_end, covers_rule)
      VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'x', 'transcribed', '2000-06-01', '2000-06-10', 'logbook_entry')`);

    expect((await listTexts(client, { overlapsPhoto: covered })).items).toHaveLength(1);
    expect((await listTexts(client, { overlapsPhoto: notCovered })).items).toHaveLength(0);
  });
});

test('log entry fields travel for log_entry, are null for passage', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true), ('ma-vie', 'handwritten', 'Ma vie', true)`);
    await client.query(`INSERT INTO pipeline.text_unit
      (kind, id, document_id, ordinal, body, confidence, entry_time, raw_position, place_name)
      VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'x', 'transcribed', '06:30', '43 12N 9 05W', null)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('passage', 'ma-vie/p001/001', 'ma-vie', 1, 'x', 'transcribed')`);

    const { items } = await listTexts(client, { sort: 'date' });
    const entry = items.find((i) => i.ref.kind === 'log_entry');
    const passage = items.find((i) => i.ref.kind === 'passage');
    expect(entry?.logEntry?.time).toBe('06:30');
    expect(entry?.logEntry?.rawPosition).toBe('43 12N 9 05W');
    expect(passage?.logEntry).toBeNull();
  });
});

test('a web passage with no ref.web_span covers nothing, and no photo overlaps it', async () => {
  await withRollback(async (client) => {
    const photo = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'folder-month', 'album_month', '1999-10-01', '1999-10-01', 'day')`,
      [photo, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('web/1999/Transat', 'html', 'La transat', false)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('passage', 'web/1999/Transat/001', 'web/1999/Transat', 1, 'x', 'transcribed')`);

    expect((await listTexts(client, { overlapsPhoto: photo })).items).toEqual([]);
  });
});

test('RULE C — ref.web_span entered AFTER import still makes the overlap appear, live, no re-import', async () => {
  await withRollback(async (client) => {
    const photo = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'folder-month', 'album_month', '1999-10-01', '1999-10-01', 'day')`,
      [photo, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('web/1999/Transat', 'html', 'La transat', false)`);
    // `covers_start`/`covers_end`/`covers_rule` restent NULL — importés AVANT toute saisie de span.
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('passage', 'web/1999/Transat/001', 'web/1999/Transat', 1, 'x', 'transcribed')`);

    expect((await listTexts(client, { overlapsPhoto: photo })).items).toEqual([]);

    await client.query(`INSERT INTO ref.web_span (document_id, date_from, date_to)
                        VALUES ('web/1999/Transat', '1999-09-01', '1999-11-30')`);

    const { items } = await listTexts(client, { overlapsPhoto: photo });
    expect(items).toHaveLength(1);
    expect(items[0]?.overlappingPhotoCount).toBe(1);
  });
});
