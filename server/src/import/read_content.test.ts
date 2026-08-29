import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, expect, test } from 'vitest';

import { readOcr } from './read_content.ts';

let db: DatabaseSync;

beforeEach(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mcp-content-'));
  db = new DatabaseSync(path.join(dir, 'mcp-content.db'));
  db.exec(`CREATE TABLE ocr(
    sha256 TEXT PRIMARY KEY, text TEXT NOT NULL, lang TEXT, blocks INTEGER NOT NULL, createdAt TEXT NOT NULL)`);
});

afterEach(() => { db.close(); });

test('reads sha256 and text, NFC-normalized, and drops the rest', () => {
  db.prepare(`INSERT INTO ocr (sha256, text, blocks, createdAt) VALUES ($s, $t, 2, 'x')`)
    .run({ s: 'a'.repeat(64), t: 'ROBERT IS HERE — FRUIT STAND, Algès'.normalize('NFD') });

  const [row] = [...readOcr(db)];
  expect(row).toEqual({ sha256: 'a'.repeat(64), text: 'ROBERT IS HERE — FRUIT STAND, Algès'.normalize('NFC') });
});

test('an empty table yields nothing', () => {
  expect([...readOcr(db)]).toEqual([]);
});
