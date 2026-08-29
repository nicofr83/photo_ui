import type { DatabaseSync } from 'node:sqlite';

import { normalizeNfc } from './nfc.ts';

/** `mcp-index.db photos`, une ligne. `dateSource` amont : 7 valeurs, texte libre. */
export interface RawPhoto {
  readonly cloudAssetId: string;
  readonly path: string;
  readonly folder: string;
  readonly albumPath: string | null;
  readonly groupName: string | null;
  readonly year: number | null;
  readonly month: number | null;
  readonly day: number | null;
  readonly dateSource: string;
  readonly captureDate: string | null;
  readonly format: string;
  readonly fileSize: number | null;
  readonly sha256: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly aestheticsScore: number | null;
  readonly cameraMake: string | null;
  readonly cameraModel: string | null;
  readonly lens: string | null;
  readonly iso: number | null;
  readonly aperture: number | null;
  readonly shutter: string | null;
  readonly focalLength: number | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly altitude: number | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly country: string | null;
  readonly sublocation: string | null;
  readonly title: string | null;
  readonly description: string | null;
}

export interface RawAlbum {
  readonly path: string;
  readonly setName: string | null;
  readonly albumName: string;
  readonly groupName: string | null;
}

export interface PhotoAlbumLink {
  readonly cloudAssetId: string;
  readonly albumPath: string;
  /** Vrai ⟺ `albums.path` égale le `photos.albumPath` de cette photo — mesuré : jamais d'écart. */
  readonly isPrimary: boolean;
}

export interface PhotoTagLink {
  readonly cloudAssetId: string;
  readonly tagName: string;
  readonly tagKind: string;
  /** 48–98 pour `ai`. Toujours NULL pour `user` — mesuré, sans exception. */
  readonly confidence: number | null;
}

export interface PhotoPersonLink {
  readonly cloudAssetId: string;
  readonly personName: string;
}

function* rows<T>(db: DatabaseSync, sql: string): Generator<T> {
  for (const row of db.prepare(sql).iterate()) {
    yield normalizeNfc(row as unknown as T);
  }
}

export function readPhotos(db: DatabaseSync): Generator<RawPhoto> {
  return rows<RawPhoto>(db, `
    SELECT cloudAssetId, path, folder, albumPath, groupName, year, month, day,
           dateSource, captureDate, format, fileSize, sha256, width, height,
           aestheticsScore, cameraMake, cameraModel, lens, iso, aperture, shutter,
           focalLength, latitude, longitude, altitude, city, state, country,
           sublocation, title, description
      FROM photos`);
}

export function readAlbums(db: DatabaseSync): Generator<RawAlbum> {
  return rows<RawAlbum>(db, `SELECT path, setName, albumName, groupName FROM albums`);
}

/**
 * Jointure : le lien porte `cloudAssetId`, jamais l'id interne `photos.id`.
 *
 * SQLite n'a pas de type booléen : `(a.path = p.albumPath)` rend un entier
 * 0/1, pas un `boolean` JS — mesuré, et ça a surpris le premier test écrit
 * contre ce lecteur. Cette fonction est la seule à ne PAS passer par le
 * générateur générique `rows`, précisément pour faire cette conversion une
 * fois ici plutôt que de laisser un 0/1 traverser jusqu'au `COPY` Postgres.
 */
export function* readPhotoAlbumLinks(db: DatabaseSync): Generator<PhotoAlbumLink> {
  const stmt = db.prepare(`
    SELECT p.cloudAssetId AS cloudAssetId, a.path AS albumPath,
           (a.path = p.albumPath) AS isPrimary
      FROM photo_albums pa
      JOIN photos p ON p.id = pa.photoId
      JOIN albums a ON a.id = pa.albumId`);
  for (const row of stmt.iterate()) {
    const raw = row as unknown as { cloudAssetId: string; albumPath: string; isPrimary: number };
    yield normalizeNfc({ ...raw, isPrimary: raw.isPrimary === 1 });
  }
}

export function readPhotoTagLinks(db: DatabaseSync): Generator<PhotoTagLink> {
  return rows<PhotoTagLink>(db, `
    SELECT p.cloudAssetId AS cloudAssetId, t.name AS tagName, t.kind AS tagKind,
           pt.confidence AS confidence
      FROM photo_tags pt
      JOIN photos p ON p.id = pt.photoId
      JOIN tags t ON t.id = pt.tagId`);
}

export function readPhotoPersonLinks(db: DatabaseSync): Generator<PhotoPersonLink> {
  return rows<PhotoPersonLink>(db, `
    SELECT p.cloudAssetId AS cloudAssetId, pe.name AS personName
      FROM photo_people pp
      JOIN photos p ON p.id = pp.photoId
      JOIN people pe ON pe.id = pp.personId`);
}
