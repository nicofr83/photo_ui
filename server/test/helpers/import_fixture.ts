import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { ImportSources } from '../../src/import/import_service.ts';

/**
 * Un jeu d'essai MINIMAL, pas une copie de la vraie base (3 930 photos, 82
 * albums) — une instance de chaque piège que l'import doit tenir :
 *
 *   - un album au préfixe NFD (comme macOS l'écrit)
 *   - un EXIF de 2017 dans un album de 2000 (rang 4, arbitrage rejeté)
 *   - une proposition `logbook-bracket` (rang 3) ET une `manual` (le rang 3
 *     ne doit prendre QUE la première — c'est la faille corrigée)
 *   - un album à année seule (rang 6)
 *   - une photo sans aucune date, sans album (non datée)
 *   - un passage ET une entrée de journal partageant le MÊME id sur la même
 *     page — la collision des 456
 *
 * Les quatre bases SQLite amont sont construites avec le schéma réel, vérifié
 * sur `mcp-index.db`, `mcp-content.db`, `documents.db` et `dating.db`.
 */
export async function buildImportFixture(): Promise<ImportSources> {
  const dir = await mkdtemp(path.join(tmpdir(), 'import-fixture-'));
  const originalsRoot = '/originals';

  const nfdAlbum = '1998-1999/1998-02-Maison rose Algès'.normalize('NFD');

  // ---------------------------------------------------------------- mcp-index.db
  const indexDb = new DatabaseSync(path.join(dir, 'mcp-index.db'));
  indexDb.exec(`
    CREATE TABLE photos(
      id INTEGER PRIMARY KEY, cloudAssetId TEXT UNIQUE NOT NULL, path TEXT UNIQUE NOT NULL,
      folder TEXT NOT NULL, albumPath TEXT, groupName TEXT, year INTEGER, month INTEGER,
      day INTEGER, sequence INTEGER, dateSource TEXT NOT NULL, captureDate TEXT,
      rating INTEGER, flag TEXT, format TEXT NOT NULL, fileSize INTEGER, sha256 TEXT,
      width INTEGER, height INTEGER, aestheticsScore INTEGER, cameraMake TEXT,
      cameraModel TEXT, lens TEXT, iso INTEGER, aperture REAL, shutter TEXT,
      focalLength REAL, latitude REAL, longitude REAL, altitude REAL, city TEXT,
      state TEXT, country TEXT, countryCode TEXT, sublocation TEXT, title TEXT,
      description TEXT, hasDevelop INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE albums(
      id INTEGER PRIMARY KEY, path TEXT UNIQUE NOT NULL, setName TEXT,
      albumName TEXT NOT NULL, groupName TEXT, year INTEGER, month INTEGER, dateSource TEXT NOT NULL);
    CREATE TABLE photo_albums(photoId INTEGER NOT NULL, albumId INTEGER NOT NULL);
    CREATE TABLE tags(id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, UNIQUE(name, kind));
    CREATE TABLE photo_tags(photoId INTEGER NOT NULL, tagId INTEGER NOT NULL, confidence INTEGER);
    CREATE TABLE people(id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
    CREATE TABLE photo_people(photoId INTEGER NOT NULL, personId INTEGER NOT NULL, x REAL, y REAL, w REAL, h REAL);
  `);
  const insertPhoto = indexDb.prepare(`INSERT INTO photos
    (id, cloudAssetId, path, folder, albumPath, dateSource, captureDate, format, sha256, latitude, longitude)
    VALUES ($id, $cloudAssetId, $path, '/originals', $albumPath, $dateSource, $captureDate, 'jpg', $sha256, $lat, $lon)`);

  // rang 1 : annotation à la main — l'album dirait décembre 2000
  insertPhoto.run({ id: 1, cloudAssetId: 'a'.repeat(32), path: '/originals/a.jpg',
    albumPath: 'set/2000-12-viree', dateSource: 'capture-date', captureDate: '2017-04-11T09:15:00',
    sha256: 'a'.repeat(64), lat: null, lon: null });
  // rang 4 : EXIF 2017 dans l'album 2000, arbitrage rejeté
  insertPhoto.run({ id: 2, cloudAssetId: 'b'.repeat(32), path: '/originals/b.jpg',
    albumPath: 'set/2000-12-viree', dateSource: 'capture-date', captureDate: '2017-04-11T09:15:00',
    sha256: 'b'.repeat(64), lat: 38.5, lon: -9.2 });
  // rang 3 : proposition logbook-bracket
  insertPhoto.run({ id: 3, cloudAssetId: 'c'.repeat(32), path: '/originals/c.jpg',
    albumPath: 'set/2000-12-viree', dateSource: 'folder-month', captureDate: null,
    sha256: 'c'.repeat(64), lat: null, lon: null });
  // rang 3 GATE : proposition 'manual' — ne doit PAS gagner le rang 3
  insertPhoto.run({ id: 4, cloudAssetId: 'd'.repeat(32), path: '/originals/d.jpg',
    albumPath: 'set/2000-12-viree', dateSource: 'folder-month', captureDate: null,
    sha256: 'd'.repeat(64), lat: null, lon: null });
  // rang 6 : album à année seule
  insertPhoto.run({ id: 5, cloudAssetId: 'e'.repeat(32), path: '/originals/e.jpg',
    albumPath: 'set/2002', dateSource: 'folder-year', captureDate: null,
    sha256: 'e'.repeat(64), lat: null, lon: null });
  // non datée : ni album, ni EXIF, ni annotation, ni proposition
  insertPhoto.run({ id: 6, cloudAssetId: 'f'.repeat(32), path: '/originals/f.jpg',
    albumPath: null, dateSource: 'none', captureDate: null,
    sha256: 'f'.repeat(64), lat: null, lon: null });
  // l'album NFD — retrouvé en NFC après l'import
  insertPhoto.run({ id: 7, cloudAssetId: '1'.repeat(32), path: `/originals/${nfdAlbum}/g.jpg`,
    albumPath: nfdAlbum, dateSource: 'folder-month', captureDate: null,
    sha256: '1'.repeat(64), lat: null, lon: null });

  indexDb.prepare(`INSERT INTO albums (id, path, albumName, dateSource)
    VALUES (1, 'set/2000-12-viree', '2000-12-viree au Venezuela', 'prefix')`).run();
  indexDb.prepare(`INSERT INTO albums (id, path, albumName, dateSource)
    VALUES (2, 'set/2002', '2002-38Dec02', 'prefix')`).run();
  indexDb.prepare(`INSERT INTO albums (id, path, albumName, dateSource)
    VALUES (3, $path, $name, 'prefix')`)
    .run({ path: nfdAlbum, name: `1998-02-Maison rose ${'Algès'.normalize('NFD')}` });

  const photoAlbumLinks: readonly (readonly [number, number])[] =
    [[1, 1], [2, 1], [3, 1], [4, 1], [5, 2], [7, 3]];
  const insertLink = indexDb.prepare(`INSERT INTO photo_albums (photoId, albumId) VALUES ($p, $a)`);
  for (const [photoId, albumId] of photoAlbumLinks) {
    insertLink.run({ p: photoId, a: albumId });
  }
  indexDb.prepare(`INSERT INTO tags (id, name, kind) VALUES (1, 'italy', 'ai')`).run();
  indexDb.prepare(`INSERT INTO photo_tags (photoId, tagId, confidence) VALUES (1, 1, 82)`).run();
  indexDb.prepare(`INSERT INTO people (id, name) VALUES (1, 'Nicolas')`).run();
  indexDb.prepare(`INSERT INTO photo_people (photoId, personId) VALUES (1, 1)`).run();
  indexDb.close();

  // ---------------------------------------------------------------- mcp-content.db
  const contentDb = new DatabaseSync(path.join(dir, 'mcp-content.db'));
  contentDb.exec(`CREATE TABLE ocr(sha256 TEXT PRIMARY KEY, text TEXT NOT NULL, lang TEXT,
    blocks INTEGER NOT NULL, createdAt TEXT NOT NULL)`);
  contentDb.prepare(`INSERT INTO ocr (sha256, text, blocks, createdAt) VALUES ($s, 'FRUIT STAND', 1, 'x')`)
    .run({ s: 'a'.repeat(64) });
  contentDb.close();

  // ---------------------------------------------------------------- dating.db
  const datingDb = new DatabaseSync(path.join(dir, 'dating.db'));
  datingDb.exec(`
    CREATE TABLE proposals(photoId TEXT PRIMARY KEY, date TEXT, dateSource TEXT NOT NULL,
      latitude REAL, longitude REAL, positionSource TEXT, evidence TEXT NOT NULL,
      spanHours REAL, confidence TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE unresolved(photoId TEXT PRIMARY KEY, albumPath TEXT NOT NULL, reason TEXT NOT NULL,
      createdAt TEXT NOT NULL, candidates TEXT);
  `);
  datingDb.prepare(`INSERT INTO proposals
    (photoId, date, dateSource, latitude, longitude, positionSource, evidence, spanHours, confidence, createdAt)
    VALUES ($id, '2000-12-20', 'logbook-bracket', 38.5, -9.2, 'logbook-interpolated',
            '["logbook/p001/019"]', 407.75, 'proposed', 'x')`)
    .run({ id: 'c'.repeat(32) });
  datingDb.prepare(`INSERT INTO proposals
    (photoId, date, dateSource, evidence, confidence, createdAt)
    VALUES ($id, '1998-08-23', 'manual', '[]', 'manual', 'x')`)
    .run({ id: 'd'.repeat(32) });
  datingDb.prepare(`INSERT INTO unresolved (photoId, albumPath, reason, createdAt)
    VALUES ($id, 'set/2000-12-viree', 'no-place-in-name', 'x')`)
    .run({ id: 'e'.repeat(32) });
  datingDb.close();

  // ---------------------------------------------------------------- documents.db
  const documentsDb = new DatabaseSync(path.join(dir, 'documents.db'));
  documentsDb.exec(`
    CREATE TABLE documents(id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, author TEXT,
      sourcePath TEXT NOT NULL, pageCount INTEGER, sha256 TEXT NOT NULL);
    CREATE TABLE pages(id TEXT PRIMARY KEY, documentId TEXT NOT NULL, ordinal INTEGER NOT NULL,
      label TEXT, imagePath TEXT NOT NULL, region TEXT, rotation INTEGER NOT NULL DEFAULT 0,
      width INTEGER NOT NULL, height INTEGER NOT NULL, startAt TEXT, endAt TEXT,
      startLat REAL, startLon REAL, endLat REAL, endLon REAL, spanSource TEXT);
    CREATE TABLE passages(id TEXT PRIMARY KEY, documentId TEXT NOT NULL, pageId TEXT,
      ordinal INTEGER NOT NULL, text TEXT NOT NULL, dateFrom TEXT, dateTo TEXT, confidence TEXT NOT NULL);
    CREATE TABLE log_entries(id TEXT PRIMARY KEY, pageId TEXT NOT NULL, seq INTEGER NOT NULL,
      date TEXT NOT NULL, time TEXT, latitude REAL, longitude REAL, rawPosition TEXT,
      placeName TEXT, heading TEXT, wind TEXT, baro REAL, engineHours REAL, remark TEXT,
      fixConfidence TEXT NOT NULL, remarkConfidence TEXT NOT NULL);
  `);
  documentsDb.prepare(`INSERT INTO documents (id, kind, title, sourcePath, pageCount, sha256)
    VALUES ('logbook', 'handwritten', 'Journal du bord', 'x', 1, 'h')`).run();
  documentsDb.prepare(`INSERT INTO pages
    (id, documentId, ordinal, imagePath, width, height, startAt, endAt, spanSource)
    VALUES ('logbook/p001', 'logbook', 1, 'p001.jpg', 800, 1200, '1998-08-23', '1998-09-01', 'entries')`)
    .run();
  // LA COLLISION : même id, un passage ET une entrée de journal.
  documentsDb.prepare(`INSERT INTO passages (id, documentId, pageId, ordinal, text, dateFrom, confidence)
    VALUES ('logbook/p001/001', 'logbook', 'logbook/p001', 1, 'la prose du haut de page', NULL, 'reviewed')`)
    .run();
  documentsDb.prepare(`INSERT INTO log_entries
    (id, pageId, seq, date, time, remark, fixConfidence, remarkConfidence)
    VALUES ('logbook/p001/001', 'logbook/p001', 1, '1998-08-23', '14:00',
            'Depart Lisbonne - Ecluse', 'transcribed', 'transcribed')`)
    .run();
  documentsDb.close();

  // ---------------------------------------------------------------- annotations.jsonl
  const annotationsDir = await mkdtemp(path.join(tmpdir(), 'annotations-'));
  await writeFile(path.join(annotationsDir, 'annotations.jsonl'), `${JSON.stringify({
    id: '1', at: '2026-08-28T13:00:00.000Z', kind: 'dating',
    target: { type: 'photo', id: 'a'.repeat(32) }, value: { date: '1999-03-02' },
  })}\n`);

  return {
    mcpIndexPath: path.join(dir, 'mcp-index.db'),
    mcpContentPath: path.join(dir, 'mcp-content.db'),
    documentsPath: path.join(dir, 'documents.db'),
    datingPath: path.join(dir, 'dating.db'),
    annotationsDir,
    originalsRoot,
    perimeterSets: ['set'],
  };
}
