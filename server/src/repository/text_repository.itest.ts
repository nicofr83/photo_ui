import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import {
  deleteWebSpan, getPageImageRelpath, listDocuments, listOverlappingTexts, listPages, listTexts, listWebDocuments,
  putWebSpan,
} from './text_repository.ts';

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

test('galleryCaption is present and null on an ordinary text — never an absent field (contract §11 Q11)', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'x', 'transcribed')`);

    const { items } = await listTexts(client, {});
    expect(items[0]).toHaveProperty('galleryCaption');
    expect(items[0]?.galleryCaption).toBeNull();
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

test('listDocuments carries the ref.web_span as an inference, never null when a span was entered — a stale stored date_to is ignored (A9)', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('web/1999/Transat', 'html', 'La transat', false)`);
    // `date_to` écrit directement en base, comme un import d'avant l'amendement
    // A9 pourrait en laisser un — la chaîne calculée à la lecture ne le
    // regarde jamais : seule sans voisin daté, sa fin est son propre début.
    await client.query(`INSERT INTO ref.web_span (document_id, date_from, date_to)
                        VALUES ('web/1999/Transat', '1999-09-01', '1999-11-30')`);

    const documents = await listDocuments(client);
    const doc = documents.find((d) => d.id === 'web/1999/Transat');
    expect(doc?.span).toEqual({
      start: '1999-09-01', end: '1999-09-01', precision: 'day', kind: 'inference', source: 'web_span',
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

test('listOverlappingTexts returns null for an unknown photo, never throws', async () => {
  await withRollback(async (client) => {
    expect(await listOverlappingTexts(client, 'f'.repeat(32))).toBeNull();
  });
});

test('listOverlappingTexts on an undated photo is an EMPTY result, never an error', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
                        VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'none')`, [id, 'b'.repeat(64)]);
    const result = await listOverlappingTexts(client, id);
    expect(result).toEqual({
      items: [],
      summary: { matchCount: 0, windowDays: 0, datedToDayCount: 0, datedToMonthCount: 0, datedToYearCount: 0, undatedCount: 0 },
    });
  });
});

test('listOverlappingTexts: an UNDATED photo still surfaces a real gallery match — identity, not a date overlap', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
                        VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'none')`, [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO app.web_gallery_link (sha256, page, image_path, caption, distance, margin, verified)
      VALUES ($1, '2003/gal.htm', 'p01.jpg', 'Le port au matin', 4, 8, null)`, ['b'.repeat(64)]);

    const result = await listOverlappingTexts(client, id);
    expect(result?.items).toHaveLength(1);
    expect(result?.items[0]?.ref).toEqual({ kind: 'web_caption', id: `${'b'.repeat(64)}:p01.jpg` });
    expect(result?.items[0]?.overlap).toEqual({
      rule: 'gallery_match', photoSpanDays: 0, textSpanDays: 0, totalSpanDays: 0, distanceToCentreDays: 0,
    });
    expect(result?.summary).toEqual({
      matchCount: 1, windowDays: 0, datedToDayCount: 0, datedToMonthCount: 0, datedToYearCount: 0, undatedCount: 1,
    });
  });
});

test('listOverlappingTexts: a DATED photo with both a date match and a gallery match — the identity match sorts first', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'exif', 'annotation', '2000-01-15', '2000-01-15', 'day')`,
      [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('doc', 'handwritten', 'Doc', false)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence, covers_start, covers_end, covers_rule)
      VALUES ('passage', 'doc/p1', 'doc', 1, 'p1', 'transcribed', '2000-01-10', '2000-01-20', 'passage')`);
    await client.query(`INSERT INTO app.web_gallery_link (sha256, page, image_path, caption, distance, margin, verified)
      VALUES ($1, '2003/gal.htm', 'p01.jpg', 'Le port au matin', 4, 8, null)`, ['b'.repeat(64)]);

    const result = await listOverlappingTexts(client, id);
    expect(result?.items).toHaveLength(2);
    expect(result?.items[0]?.ref.kind).toBe('web_caption');
    expect(result?.items[0]?.overlap.totalSpanDays).toBe(0);
    expect(result?.items[1]?.ref).toEqual({ kind: 'passage', id: 'doc/p1' });
    expect(result?.summary.matchCount).toBe(2);
  });
});

test('both widths travel, and the default order is the sum of the widths, ascending', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    // Photo au MOIS — 29 jours d'écart, ignorés.
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'folder-month', 'album_month', '2000-06-01', '2000-06-30', 'month')`,
      [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    // Fenêtre étroite (6 jours), à l'intérieur du mois.
    await client.query(`INSERT INTO pipeline.text_unit
      (kind, id, document_id, ordinal, body, confidence, covers_start, covers_end, covers_rule)
      VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'proche', 'transcribed', '2000-06-10', '2000-06-16', 'logbook_entry')`);
    // Fenêtre large (le mois entier + au-delà), chevauche aussi.
    await client.query(`INSERT INTO pipeline.text_unit
      (kind, id, document_id, ordinal, body, confidence, covers_start, covers_end, covers_rule)
      VALUES ('log_entry', 'logbook/p002/001', 'logbook', 2, 'large', 'transcribed', '2000-05-01', '2000-07-31', 'logbook_entry')`);

    const result = await listOverlappingTexts(client, id);
    expect(result?.items).toHaveLength(2);
    expect(result?.items[0]?.text).toBe('proche'); // la fenêtre étroite gagne : somme plus petite
    expect(result?.items[0]?.overlap).toMatchObject({
      rule: 'logbook_entry', photoSpanDays: 29, textSpanDays: 6, totalSpanDays: 35,
    });
    const sums = (result?.items ?? []).map((i) => i.overlap.totalSpanDays);
    expect([...sums].sort((a, b) => a - b)).toEqual(sums);
    expect(result?.summary).toEqual({
      matchCount: 2, windowDays: 29, datedToDayCount: 0, datedToMonthCount: 0, datedToYearCount: 0, undatedCount: 2,
    });
  });
});

test('a text outside the photo window is excluded — no width cap needed to say so', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'folder-month', 'album_month', '2000-06-01', '2000-06-01', 'day')`,
      [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit
      (kind, id, document_id, ordinal, body, confidence, covers_start, covers_end, covers_rule)
      VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'x', 'transcribed', '2001-01-01', '2001-01-05', 'logbook_entry')`);

    const result = await listOverlappingTexts(client, id);
    expect(result?.items).toEqual([]);
  });
});

test('RULE C reaches the reverse direction too — a web passage overlaps once ref.web_span exists', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'folder-month', 'album_month', '1999-10-01', '1999-10-01', 'day')`,
      [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('web/1999/Transat', 'html', 'La transat', false)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('passage', 'web/1999/Transat/001', 'web/1999/Transat', 1, 'x', 'transcribed')`);

    expect((await listOverlappingTexts(client, id))?.items).toEqual([]);

    await client.query(`INSERT INTO ref.web_span (document_id, date_from, date_to)
                        VALUES ('web/1999/Transat', '1999-09-01', '1999-11-30')`);
    const result = await listOverlappingTexts(client, id);
    expect(result?.items).toHaveLength(1);
    expect(result?.items[0]?.overlap.rule).toBe('web_span');
  });
});

test('q searches the EFFECTIVE text (corrected if corrected) via app.text_search, refreshed at import (§8.2)', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'un mot introuvable ailleurs: xylophone', 'transcribed')`);
    // La vue matérialisée doit être rafraîchie pour voir les données de CETTE
    // transaction — exactement ce que fait `runImportInto` en réel.
    await client.query(`REFRESH MATERIALIZED VIEW app.text_search`);

    const { items, total } = await listTexts(client, { q: 'xylophone' });
    expect(total).toBe(1);
    expect(items[0]?.ref.id).toBe('logbook/p001/001');
  });
});

test('a pure-noise q matches ZERO, never the whole library', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'x', 'transcribed')`);
    await client.query(`REFRESH MATERIALIZED VIEW app.text_search`);

    expect((await listTexts(client, { q: '!!! &&& ***' })).total).toBe(0);
  });
});

test('highlights carries UTF-16 offsets into the EFFECTIVE text, only when q is present', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'Un mouillage a Belize', 'transcribed')`);
    await client.query(`REFRESH MATERIALIZED VIEW app.text_search`);

    const withQuery = await listTexts(client, { q: 'belize' });
    const range = withQuery.items[0]?.highlights[0];
    expect(range).toBeDefined();
    expect('Un mouillage a Belize'.slice(range?.start ?? 0, (range?.start ?? 0) + (range?.length ?? 0))).toBe('Belize');

    const withoutQuery = await listTexts(client, {});
    expect(withoutQuery.items[0]?.highlights).toEqual([]);
  });
});

test('search finds the CORRECTED text, not the upstream transcription alone', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'Depart a cinq heures', 'transcribed')`);
    await client.query(`INSERT INTO app.text_correction (text_kind, text_id, corrected_text, original_at_correction)
                        VALUES ('log_entry', 'logbook/p001/001', 'un mot introuvable ailleurs: xylophone', 'Depart a cinq heures')`);
    await client.query(`REFRESH MATERIALIZED VIEW app.text_search`);

    expect((await listTexts(client, { q: 'xylophone' })).total).toBe(1);
    expect((await listTexts(client, { q: 'depart' })).total).toBe(0);
  });
});

test('listWebDocuments carries an excerpt from the first passage (corrected text if corrected)', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('web/1999/Transat', 'html', 'La transat', false)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('passage', 'web/1999/Transat/001', 'web/1999/Transat', 1, 'texte amont', 'transcribed')`);
    await client.query(`INSERT INTO app.text_correction (text_kind, text_id, corrected_text, original_at_correction)
                        VALUES ('passage', 'web/1999/Transat/001', 'texte corrigé', 'texte amont')`);

    const docs = await listWebDocuments(client);
    const doc = docs.find((d) => d.documentId === 'web/1999/Transat');
    expect(doc?.excerpt).toBe('texte corrigé');
    expect(doc?.pathHint).toBe('web/1999/Transat');
    expect(doc?.span).toBeNull();
  });
});

test('putWebSpan/deleteWebSpan round-trip, null for a non-html or unknown document — a single bound only (A9)', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('web/1999/Transat', 'html', 'La transat', false),
                               ('logbook', 'handwritten', 'Journal', true)`);

    expect(await putWebSpan(client, { documentId: 'nowhere', dateFrom: '1999-01-01', note: null })).toBeNull();
    expect(await putWebSpan(client, { documentId: 'logbook', dateFrom: '1999-01-01', note: null })).toBeNull();

    // Seule dans la base : rien après elle dans l'ordre des dates — sa
    // propre fin est son propre début (Nicolas, via team-lead : "la date de
    // début du suivant est la date de fin" — sans suivant, un jour seul).
    const put = await putWebSpan(client, { documentId: 'web/1999/Transat', dateFrom: '1999-09-01', note: 'saisi' });
    expect(put?.span).toEqual({
      start: '1999-09-01', end: '1999-09-01', precision: 'day', kind: 'inference', source: 'web_span',
      bracketHours: null,
    });

    const deleted = await deleteWebSpan(client, 'web/1999/Transat');
    expect(deleted?.span).toBeNull();
  });
});

test('a dated document\'s end is the NEXT dated document\'s start minus a day — chained by DATE, never document_id', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
      VALUES ('web/1999/Transat', 'html', 'x', false), ('web/1999/Caraibe', 'html', 'x', false),
             ('web/1999/VersTrinidad', 'html', 'x', false)`);
    // Insérés dans le désordre : l'ordre qui compte est celui des DATES, pas
    // celui des appels ni celui des identifiants (`Caraibe` < `Transat` en
    // `document_id`, l'inverse en date — la mesure qui a tranché la question).
    await putWebSpan(client, { documentId: 'web/1999/Caraibe', dateFrom: '2000-01-01', note: null });
    await putWebSpan(client, { documentId: 'web/1999/Transat', dateFrom: '1999-11-10', note: null });
    await putWebSpan(client, { documentId: 'web/1999/VersTrinidad', dateFrom: '2000-01-15', note: null });

    const rows = await listWebDocuments(client);
    expect(rows.find((r) => r.documentId === 'web/1999/Transat')?.span)
      .toMatchObject({ start: '1999-11-10', end: '1999-12-31' });
    expect(rows.find((r) => r.documentId === 'web/1999/Caraibe')?.span)
      .toMatchObject({ start: '2000-01-01', end: '2000-01-14' });
    // Le dernier par la date, aucun suivant : sa propre fin est son propre début.
    expect(rows.find((r) => r.documentId === 'web/1999/VersTrinidad')?.span)
      .toMatchObject({ start: '2000-01-15', end: '2000-01-15' });
  });
});

test('an undated document has NO period at all — no inheritance on the web (Nicolas, via team-lead)', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
      VALUES ('web/1999/Transat', 'html', 'x', false), ('web/1999/bidon', 'html', 'x', false)`);
    await putWebSpan(client, { documentId: 'web/1999/Transat', dateFrom: '1999-11-10', note: null });

    const rows = await listWebDocuments(client);
    // Un héritage rattraperait `bidon` (un gabarit vide) et lui donnerait une
    // période inventée — précisément ce que Nicolas ne veut pas : les rebuts
    // « sortent d'eux-mêmes en restant sans date ».
    expect(rows.find((r) => r.documentId === 'web/1999/bidon')?.span).toBeNull();
  });
});

test('deleting a dated document extends its neighbours\' chain — computed live, nothing stored', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
      VALUES ('web/a', 'html', 'x', false), ('web/b', 'html', 'x', false), ('web/c', 'html', 'x', false)`);
    await putWebSpan(client, { documentId: 'web/a', dateFrom: '2000-01-01', note: null });
    await putWebSpan(client, { documentId: 'web/b', dateFrom: '2000-02-01', note: null });
    await putWebSpan(client, { documentId: 'web/c', dateFrom: '2000-03-01', note: null });

    await deleteWebSpan(client, 'web/b');

    const rows = await listWebDocuments(client);
    // `a` va maintenant jusqu'à la veille de `c` — `b` a disparu de la chaîne.
    expect(rows.find((r) => r.documentId === 'web/a')?.span).toMatchObject({ start: '2000-01-01', end: '2000-02-29' });
    expect(rows.find((r) => r.documentId === 'web/b')?.span).toBeNull();
  });
});

describe('listTexts — kind: web_caption', () => {
  test('shapes a real gallery match as a TextUnit — documentId derived from page, direct-link overlap', async () => {
    await withRollback(async (client) => {
      const id = 'a'.repeat(32);
      await client.query(`INSERT INTO pipeline.photo (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
        VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'none')`, [id, 'b'.repeat(64)]);
      await client.query(`INSERT INTO app.web_gallery_link (sha256, page, image_path, caption, alt, distance, margin, verified)
        VALUES ($1, '2003/2003_gal_11.htm', 'photos/p01.jpg', 'Le port au matin', null, 4, 8, null)`, ['b'.repeat(64)]);

      const { items, total } = await listTexts(client, { kind: 'web_caption' });
      expect(total).toBe(1);
      expect(items).toHaveLength(1);
      const unit = items[0];
      expect(unit?.ref).toEqual({ kind: 'web_caption', id: `${'b'.repeat(64)}:photos/p01.jpg` });
      expect(unit?.documentId).toBe('web/2003/2003_gal_11');
      expect(unit?.pageId).toBeNull();
      expect(unit?.text).toBe('Le port au matin');
      expect(unit?.textOriginal).toBe('Le port au matin');
      expect(unit?.date).toBeNull();
      expect(unit?.confidence).toBe('uncertain');
      expect(unit?.overlappingPhotoCount).toBe(1);
      expect(unit?.galleryCaption).toEqual({
        sha256: 'b'.repeat(64), page: '2003/2003_gal_11.htm', imagePath: 'photos/p01.jpg',
        distance: 4, margin: 8, verified: false,
      });
    });
  });

  test('falls back to alt when caption is null; verified: true maps confidence to reviewed', async () => {
    await withRollback(async (client) => {
      await client.query(`INSERT INTO app.web_gallery_link (sha256, page, image_path, caption, alt, distance, margin, verified)
        VALUES ($1, 'p.htm', 'i.jpg', null, 'texte alternatif', 2, 10, true)`, ['c'.repeat(64)]);

      const { items } = await listTexts(client, { kind: 'web_caption' });
      expect(items[0]?.text).toBe('texte alternatif');
      expect(items[0]?.confidence).toBe('reviewed');
      expect(items[0]?.galleryCaption?.verified).toBe(true);
    });
  });

  test('a match with neither caption nor alt is excluded — nothing to read as a text', async () => {
    await withRollback(async (client) => {
      await client.query(`INSERT INTO app.web_gallery_link (sha256, page, image_path, distance, margin, verified)
        VALUES ($1, 'p.htm', 'i.jpg', 3, 5, null)`, ['d'.repeat(64)]);

      const { items, total } = await listTexts(client, { kind: 'web_caption' });
      expect(items).toEqual([]);
      expect(total).toBe(0);
    });
  });

  test('a match a human explicitly rejected (verified: false) is excluded, never shown as a caption', async () => {
    await withRollback(async (client) => {
      await client.query(`INSERT INTO app.web_gallery_link (sha256, page, image_path, caption, distance, margin, verified)
        VALUES ($1, 'p.htm', 'i.jpg', 'mauvais appariement', 20, 1, false)`, ['e'.repeat(64)]);

      const { items } = await listTexts(client, { kind: 'web_caption' });
      expect(items).toEqual([]);
    });
  });

  test('a photo with no matching sha256 in pipeline.photo has overlappingPhotoCount 0, still a valid TextUnit', async () => {
    await withRollback(async (client) => {
      await client.query(`INSERT INTO app.web_gallery_link (sha256, page, image_path, caption, distance, margin, verified)
        VALUES ($1, 'p.htm', 'i.jpg', 'texte', 3, 5, null)`, ['f'.repeat(64)]);

      const { items } = await listTexts(client, { kind: 'web_caption' });
      expect(items[0]?.overlappingPhotoCount).toBe(0);
    });
  });
});
