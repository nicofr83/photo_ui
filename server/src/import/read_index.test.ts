import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, expect, test } from 'vitest';

import {
  readAlbums, readPeople, readPhotoAlbumLinks, readPhotoPersonLinks, readPhotos, readPhotoTagLinks,
  readTags,
} from './read_index.ts';

let db: DatabaseSync;

// Schéma copié de `mcp-index.db`, tel qu'inspecté sur la vraie base.
beforeEach(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mcp-index-'));
  db = new DatabaseSync(path.join(dir, 'mcp-index.db'));
  db.exec(`
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
    CREATE TABLE photo_albums(
      photoId INTEGER NOT NULL REFERENCES photos(id), albumId INTEGER NOT NULL REFERENCES albums(id));
    CREATE TABLE tags(id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, UNIQUE(name, kind));
    CREATE TABLE photo_tags(
      photoId INTEGER NOT NULL REFERENCES photos(id), tagId INTEGER NOT NULL REFERENCES tags(id),
      confidence INTEGER);
    CREATE TABLE people(id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
    CREATE TABLE photo_people(
      photoId INTEGER NOT NULL REFERENCES photos(id), personId INTEGER NOT NULL REFERENCES people(id),
      x REAL, y REAL, w REAL, h REAL);
  `);
});

afterEach(() => { db.close(); });

const NFD_ALGES = 'Algès'; // 'e' + accent grave combinant, comme macOS l'écrit
const NFC_ALGES = 'Algès';

test('readPhotos yields every column, NFC-normalized', () => {
  db.prepare(`INSERT INTO photos
    (cloudAssetId, path, folder, albumPath, dateSource, format)
    VALUES ($id, $path, 'f', $album, 'exif', 'jpg')`).run({
    id: 'a'.repeat(32), path: `/x/${NFD_ALGES}.jpg`, album: `1998-1999/1998-02-${NFD_ALGES}`,
  });

  const [photo] = [...readPhotos(db)];
  expect(photo?.cloudAssetId).toBe('a'.repeat(32));
  expect(photo?.path).toBe(`/x/${NFC_ALGES}.jpg`);
  expect(photo?.albumPath).toBe(`1998-1999/1998-02-${NFC_ALGES}`);
  expect(photo?.dateSource).toBe('exif');
});

test('readAlbums yields NFC-normalized names', () => {
  db.prepare(`INSERT INTO albums (path, albumName, dateSource) VALUES ($p, $n, 'prefix')`)
    .run({ p: `1998-1999/1998-02-${NFD_ALGES}`, n: `Maison rose ${NFD_ALGES}` });

  const [album] = [...readAlbums(db)];
  expect(album?.path).toBe(`1998-1999/1998-02-${NFC_ALGES}`);
  expect(album?.albumName).toBe(`Maison rose ${NFC_ALGES}`);
});

test('readPhotoAlbumLinks marks isPrimary exactly where albums.path equals the photo\'s own albumPath', () => {
  const id = 'b'.repeat(32);
  db.prepare(`INSERT INTO photos (id, cloudAssetId, path, folder, albumPath, dateSource, format)
    VALUES (1, $id, '/x/1.jpg', 'f', 'main/album', 'exif', 'jpg')`).run({ id });
  db.prepare(`INSERT INTO albums (id, path, albumName, dateSource) VALUES (1, 'main/album', 'x', 'prefix')`).run();
  db.prepare(`INSERT INTO albums (id, path, albumName, dateSource) VALUES (2, 'other/album', 'y', 'prefix')`).run();
  db.prepare(`INSERT INTO photo_albums (photoId, albumId) VALUES (1, 1)`).run();
  db.prepare(`INSERT INTO photo_albums (photoId, albumId) VALUES (1, 2)`).run();

  const links = [...readPhotoAlbumLinks(db)].sort((x, y) => x.albumPath.localeCompare(y.albumPath));
  expect(links).toEqual([
    { cloudAssetId: id, albumPath: 'main/album', isPrimary: true },
    { cloudAssetId: id, albumPath: 'other/album', isPrimary: false },
  ]);
  // SQLite n'a pas de booléen : sans la conversion explicite, ceci reviendrait
  // 1/0, pas true/false — exactement le bug que ce test a d'abord attrapé.
  expect(typeof links[0]?.isPrimary).toBe('boolean');
});

test('readPhotoTagLinks joins to the durable cloudAssetId, never the internal id', () => {
  const id = 'c'.repeat(32);
  db.prepare(`INSERT INTO photos (id, cloudAssetId, path, folder, dateSource, format)
    VALUES (1, $id, '/x/1.jpg', 'f', 'exif', 'jpg')`).run({ id });
  db.prepare(`INSERT INTO tags (id, name, kind) VALUES (1, 'italy', 'ai')`).run();
  db.prepare(`INSERT INTO tags (id, name, kind) VALUES (2, 'sunset', 'user')`).run();
  db.prepare(`INSERT INTO photo_tags (photoId, tagId, confidence) VALUES (1, 1, 82)`).run();
  db.prepare(`INSERT INTO photo_tags (photoId, tagId, confidence) VALUES (1, 2, NULL)`).run();

  const links = [...readPhotoTagLinks(db)].sort((x, y) => x.tagName.localeCompare(y.tagName));
  expect(links).toEqual([
    { cloudAssetId: id, tagName: 'italy', tagKind: 'ai', confidence: 82 },
    { cloudAssetId: id, tagName: 'sunset', tagKind: 'user', confidence: null },
  ]);
});

test('readPhotoPersonLinks joins to the durable cloudAssetId and normalizes the name', () => {
  const id = 'd'.repeat(32);
  db.prepare(`INSERT INTO photos (id, cloudAssetId, path, folder, dateSource, format)
    VALUES (1, $id, '/x/1.jpg', 'f', 'exif', 'jpg')`).run({ id });
  db.prepare(`INSERT INTO people (id, name) VALUES (1, $n)`).run({ n: NFD_ALGES });
  db.prepare(`INSERT INTO photo_people (photoId, personId) VALUES (1, 1)`).run();

  expect([...readPhotoPersonLinks(db)]).toEqual([{ cloudAssetId: id, personName: NFC_ALGES }]);
});

test('readTags and readPeople are NFC-normalized', () => {
  db.prepare(`INSERT INTO tags (name, kind) VALUES ('italy', 'ai')`).run();
  db.prepare(`INSERT INTO people (name) VALUES ($n)`).run({ n: NFD_ALGES });

  expect([...readTags(db)]).toEqual([{ name: 'italy', kind: 'ai' }]);
  expect([...readPeople(db)]).toEqual([{ name: NFC_ALGES }]);
});

test('an empty table yields an empty generator, not an error', () => {
  expect([...readPhotos(db)]).toEqual([]);
});
