import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, expect, test } from 'vitest';

import { readProposals, readUnresolved } from './read_dating.ts';

let db: DatabaseSync;

// Schéma copié de `dating.db`, tel qu'inspecté sur la vraie base.
beforeEach(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'dating-'));
  db = new DatabaseSync(path.join(dir, 'dating.db'));
  db.exec(`
    CREATE TABLE proposals(
      photoId TEXT PRIMARY KEY, date TEXT, dateSource TEXT NOT NULL,
      latitude REAL, longitude REAL, positionSource TEXT, evidence TEXT NOT NULL,
      spanHours REAL, confidence TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE unresolved(
      photoId TEXT PRIMARY KEY, albumPath TEXT NOT NULL, reason TEXT NOT NULL,
      createdAt TEXT NOT NULL, candidates TEXT);
  `);
});

afterEach(() => { db.close(); });

test('readProposals carries dateSource and confidence VERBATIM — the rank-3 gate depends on it', () => {
  db.prepare(`INSERT INTO proposals
    (photoId, date, dateSource, latitude, longitude, positionSource, evidence, spanHours, confidence, createdAt)
    VALUES ($id, '2000-12-20', 'logbook-bracket', 38.5, -9.2, 'logbook-interpolated',
            '["logbook/p003/019"]', 407.75, 'proposed', 'x')`)
    .run({ id: 'a'.repeat(32) });

  const [row] = [...readProposals(db)];
  expect(row).toEqual({
    photoId: 'a'.repeat(32), date: '2000-12-20', dateSource: 'logbook-bracket',
    confidence: 'proposed', latitude: 38.5, longitude: -9.2,
    positionSource: 'logbook-interpolated', evidence: '["logbook/p003/019"]', spanHours: 407.75,
  });
});

test('a "manual" dateSource is read as-is, not filtered — the reader does not gate rank 3', () => {
  db.prepare(`INSERT INTO proposals
    (photoId, date, dateSource, evidence, confidence, createdAt)
    VALUES ($id, '1998-08-23', 'manual', '[]', 'manual', 'x')`).run({ id: 'b'.repeat(32) });

  const [row] = [...readProposals(db)];
  expect(row?.dateSource).toBe('manual');
  expect(row?.confidence).toBe('manual');
});

test('readUnresolved reads a real reason and NFC-normalizes the album path', () => {
  const nfd = '1998-1999/1998-02-Maison rose Algès'.normalize('NFD');
  db.prepare(`INSERT INTO unresolved (photoId, albumPath, reason, createdAt)
    VALUES ($id, $album, 'no-place-in-name', 'x')`).run({ id: 'c'.repeat(32), album: nfd });

  const [row] = [...readUnresolved(db)];
  expect(row?.albumPath).toBe(nfd.normalize('NFC'));
  expect(row?.reason).toBe('no-place-in-name');
  expect(row?.candidates).toBeNull();
});

test('candidates travels as raw JSON text, unparsed', () => {
  db.prepare(`INSERT INTO unresolved (photoId, albumPath, reason, candidates, createdAt)
    VALUES ($id, 'x', 'several-visits', $c, 'x')`)
    .run({ id: 'd'.repeat(32), c: '[{"place":"Lisbonne","range":{"from":"1998-07-01","to":"1998-07-31"},"fixes":3}]' });

  const [row] = [...readUnresolved(db)];
  expect(row?.candidates).toBe(
    '[{"place":"Lisbonne","range":{"from":"1998-07-01","to":"1998-07-31"},"fixes":3}]');
});

test('empty tables yield nothing', () => {
  expect([...readProposals(db)]).toEqual([]);
  expect([...readUnresolved(db)]).toEqual([]);
});
