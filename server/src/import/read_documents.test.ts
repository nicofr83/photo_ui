import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, expect, test } from 'vitest';

import { readDocuments, readLogEntries, readPages, readPassages } from './read_documents.ts';

let db: DatabaseSync;

// Schéma copié de `documents.db`, tel qu'inspecté sur la vraie base.
beforeEach(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'documents-'));
  db = new DatabaseSync(path.join(dir, 'documents.db'));
  db.exec(`
    CREATE TABLE documents(
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, author TEXT,
      sourcePath TEXT NOT NULL, pageCount INTEGER, sha256 TEXT NOT NULL);
    CREATE TABLE pages(
      id TEXT PRIMARY KEY, documentId TEXT NOT NULL REFERENCES documents(id), ordinal INTEGER NOT NULL,
      label TEXT, imagePath TEXT NOT NULL, region TEXT, rotation INTEGER NOT NULL DEFAULT 0,
      width INTEGER NOT NULL, height INTEGER NOT NULL, startAt TEXT, endAt TEXT,
      startLat REAL, startLon REAL, endLat REAL, endLon REAL, spanSource TEXT);
    CREATE TABLE passages(
      id TEXT PRIMARY KEY, documentId TEXT NOT NULL REFERENCES documents(id),
      pageId TEXT REFERENCES pages(id), ordinal INTEGER NOT NULL, text TEXT NOT NULL,
      dateFrom TEXT, dateTo TEXT, confidence TEXT NOT NULL);
    CREATE TABLE log_entries(
      id TEXT PRIMARY KEY, pageId TEXT NOT NULL REFERENCES pages(id), seq INTEGER NOT NULL,
      date TEXT NOT NULL, time TEXT, latitude REAL, longitude REAL, rawPosition TEXT,
      placeName TEXT, heading TEXT, wind TEXT, baro REAL, engineHours REAL, remark TEXT,
      fixConfidence TEXT NOT NULL, remarkConfidence TEXT NOT NULL);
  `);
});

afterEach(() => { db.close(); });

test('readDocuments derives hasPages by EXISTS, a real boolean', () => {
  db.prepare(`INSERT INTO documents (id, kind, title, sourcePath, pageCount, sha256)
    VALUES ('logbook', 'handwritten', 'Journal du bord', 'x', 52, 'h')`).run();
  db.prepare(`INSERT INTO documents (id, kind, title, sourcePath, sha256)
    VALUES ('web/1999', 'html', '1999', 'x', 'h')`).run();
  db.prepare(`INSERT INTO pages (id, documentId, ordinal, imagePath, width, height)
    VALUES ('logbook/p001', 'logbook', 1, 'x.jpg', 100, 200)`).run();

  const docs = [...readDocuments(db)].sort((a, b) => a.id.localeCompare(b.id));
  expect(docs).toEqual([
    { id: 'logbook', kind: 'handwritten', title: 'Journal du bord', pageCount: 52, hasPages: true },
    { id: 'web/1999', kind: 'html', title: '1999', pageCount: null, hasPages: false },
  ]);
  expect(typeof docs[0]?.hasPages).toBe('boolean');
});

test('readPages passes startAt/endAt/spanSource through untouched — already resolved upstream', () => {
  db.prepare(`INSERT INTO documents (id, kind, title, sourcePath, sha256)
    VALUES ('ma-vie', 'handwritten', 'Ma vie', 'x', 'h')`).run();
  db.prepare(`INSERT INTO pages
    (id, documentId, ordinal, label, imagePath, width, height, startAt, endAt, spanSource)
    VALUES ('ma-vie/p002', 'ma-vie', 2, NULL, 'p002.jpg', 800, 1200, '1999-08-04', '1999-08-04', 'carried')`)
    .run();

  const [page] = [...readPages(db)];
  expect(page).toEqual({
    id: 'ma-vie/p002', documentId: 'ma-vie', ordinal: 2, label: null, imagePath: 'p002.jpg',
    width: 800, height: 1200, startAt: '1999-08-04', endAt: '1999-08-04', spanSource: 'carried',
  });
});

test('a page with no computed window carries three nulls, not an invented one', () => {
  db.prepare(`INSERT INTO documents (id, kind, title, sourcePath, sha256)
    VALUES ('web/x', 'html', 'x', 'x', 'h')`).run();
  db.prepare(`INSERT INTO pages (id, documentId, ordinal, imagePath, width, height)
    VALUES ('web/x/p1', 'web/x', 1, 'p1.jpg', 10, 10)`).run();

  const [page] = [...readPages(db)];
  expect(page?.startAt).toBeNull();
  expect(page?.endAt).toBeNull();
  expect(page?.spanSource).toBeNull();
});

test('readPassages NFC-normalizes the text, and a dated passage carries a single day', () => {
  db.prepare(`INSERT INTO documents (id, kind, title, sourcePath, sha256)
    VALUES ('ma-vie', 'handwritten', 'Ma vie', 'x', 'h')`).run();
  const nfd = 'Algès'.normalize('NFD');
  db.prepare(`INSERT INTO passages
    (id, documentId, pageId, ordinal, text, dateFrom, dateTo, confidence)
    VALUES ('ma-vie/p007/002', 'ma-vie', NULL, 2, $t, '1999-09-23', '1999-09-23', 'reviewed')`)
    .run({ t: `Le voyage à ${nfd}` });

  const [passage] = [...readPassages(db)];
  expect(passage?.text).toBe(`Le voyage à ${nfd.normalize('NFC')}`);
  expect(passage?.dateFrom).toBe('1999-09-23');
  expect(passage?.confidence).toBe('reviewed');
});

test('readLogEntries NFC-normalizes the free-text fields', () => {
  db.prepare(`INSERT INTO documents (id, kind, title, sourcePath, sha256)
    VALUES ('logbook', 'handwritten', 'Journal du bord', 'x', 'h')`).run();
  db.prepare(`INSERT INTO pages (id, documentId, ordinal, imagePath, width, height)
    VALUES ('logbook/p003', 'logbook', 3, 'p003.jpg', 10, 10)`).run();
  const nfd = 'Départ Lisbonne - Ecluse'.normalize('NFD');
  db.prepare(`INSERT INTO log_entries
    (id, pageId, seq, date, time, remark, fixConfidence, remarkConfidence)
    VALUES ('logbook/p003/019', 'logbook/p003', 19, '1998-08-23', '14:00', $r, 'transcribed', 'transcribed')`)
    .run({ r: nfd });

  const [entry] = [...readLogEntries(db)];
  expect(entry?.remark).toBe(nfd.normalize('NFC'));
  expect(entry?.date).toBe('1998-08-23');
  expect(entry?.fixConfidence).toBe('transcribed');
});

test('empty tables yield nothing', () => {
  expect([...readDocuments(db)]).toEqual([]);
  expect([...readPages(db)]).toEqual([]);
  expect([...readPassages(db)]).toEqual([]);
  expect([...readLogEntries(db)]).toEqual([]);
});
