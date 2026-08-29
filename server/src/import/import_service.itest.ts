import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { must } from '../../test/helpers/assert.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { buildImportFixture } from '../../test/helpers/import_fixture.ts';
import { runImportInto } from './import_service.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

const id = (c: string): string => c.repeat(32);

test('the report counts match the fixture', async () => {
  await withRollback(async (client) => {
    const sources = await buildImportFixture();
    const report = await runImportInto(client, sources);

    expect(report.photos).toBe(7);
    expect(report.albums).toBe(3);
    expect(report.passages).toBe(1);
    expect(report.logEntries).toBe(1);
    expect(report.annotationsRead).toBe(1);
  });
});

describe('the cascade, materialized per photo', () => {
  test('rank 1 — the hand-typed annotation wins over a contradicting EXIF', async () => {
    await withRollback(async (client) => {
      await runImportInto(client, await buildImportFixture());
      const { rows } = await client.query<{ resolved_from: string; resolved_start: string }>(
        'SELECT resolved_from, resolved_start FROM pipeline.photo WHERE cloud_asset_id = $1', [id('a')]);
      expect(must(rows[0]).resolved_from).toBe('annotation');
      expect(must(rows[0]).resolved_start).toBe('1999-03-02');
    });
  });

  test('rank 4 — a 2017 EXIF inside a 2000 album is rejected, the album wins', async () => {
    await withRollback(async (client) => {
      await runImportInto(client, await buildImportFixture());
      const { rows } = await client.query<{ resolved_from: string; arbitration_outcome: string }>(
        'SELECT resolved_from, arbitration_outcome FROM pipeline.photo WHERE cloud_asset_id = $1', [id('b')]);
      expect(must(rows[0]).resolved_from).toBe('album_month');
      expect(must(rows[0]).arbitration_outcome).toBe('rejected');
    });
  });

  test('rank 3 — a logbook-bracket proposal carries its bracket and evidence', async () => {
    await withRollback(async (client) => {
      await runImportInto(client, await buildImportFixture());
      const { rows } = await client.query<
        { resolved_from: string; bracket_hours: number; evidence_entry_ids: string[] }
      >('SELECT resolved_from, bracket_hours, evidence_entry_ids FROM pipeline.photo WHERE cloud_asset_id = $1',
        [id('c')]);
      expect(must(rows[0]).resolved_from).toBe('logbook_bracket');
      expect(must(rows[0]).bracket_hours).toBe(407.75);
      expect(must(rows[0]).evidence_entry_ids).toEqual(['logbook/p001/019']);
    });
  });

  test('THE CORRECTION — a "manual" dating.proposal is NEVER served as rank 3', async () => {
    await withRollback(async (client) => {
      await runImportInto(client, await buildImportFixture());
      const { rows } = await client.query<{ resolved_from: string; bracket_hours: number | null }>(
        'SELECT resolved_from, bracket_hours FROM pipeline.photo WHERE cloud_asset_id = $1', [id('d')]);
      expect(must(rows[0]).resolved_from).toBe('album_month');
      expect(must(rows[0]).bracket_hours).toBeNull();
    });
  });

  test('rank 6 — a year-only album', async () => {
    await withRollback(async (client) => {
      await runImportInto(client, await buildImportFixture());
      const { rows } = await client.query<{ resolved_from: string; resolved_precision: string }>(
        'SELECT resolved_from, resolved_precision FROM pipeline.photo WHERE cloud_asset_id = $1', [id('e')]);
      expect(must(rows[0]).resolved_from).toBe('album_year');
      expect(must(rows[0]).resolved_precision).toBe('year');
    });
  });

  test('no album, no EXIF, no annotation, no proposal — undated, not invented', async () => {
    await withRollback(async (client) => {
      await runImportInto(client, await buildImportFixture());
      const { rows } = await client.query<{ resolved_from: string | null }>(
        'SELECT resolved_from FROM pipeline.photo WHERE cloud_asset_id = $1', [id('f')]);
      expect(must(rows[0]).resolved_from).toBeNull();
    });
  });
});

test('INVARIANT 9 — an album typed in NFC finds the one imported from an NFD source', async () => {
  await withRollback(async (client) => {
    await runImportInto(client, await buildImportFixture());
    const { rows } = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM pipeline.album WHERE path = $1',
      ['1998-1999/1998-02-Maison rose Algès']);
    expect(must(rows[0]).n).toBe(1);
  });
});

test('INVARIANT 4 — a passage and a log_entry sharing the same id are TWO rows, different bodies', async () => {
  await withRollback(async (client) => {
    await runImportInto(client, await buildImportFixture());
    const { rows } = await client.query<{ kind: string; body: string }>(
      `SELECT kind, body FROM pipeline.text_unit WHERE id = 'logbook/p001/001' ORDER BY kind`);
    expect(rows).toHaveLength(2);
    expect(must(rows[0]).body).not.toBe(must(rows[1]).body);
  });
});

test('photo_count is aggregated for albums, tags and people — the set-based UPDATE', async () => {
  await withRollback(async (client) => {
    await runImportInto(client, await buildImportFixture());

    const { rows: albumRows } = await client.query<{ photo_count: number }>(
      `SELECT photo_count FROM pipeline.album WHERE path = 'set/2000-12-viree'`);
    expect(must(albumRows[0]).photo_count).toBe(4);   // photos a, b, c, d

    const { rows: tagRows } = await client.query<{ photo_count: number }>(
      `SELECT photo_count FROM pipeline.tag WHERE name = 'italy' AND kind = 'ai'`);
    expect(must(tagRows[0]).photo_count).toBe(1);

    const { rows: personRows } = await client.query<{ photo_count: number }>(
      `SELECT photo_count FROM pipeline.person WHERE name = 'Nicolas'`);
    expect(must(personRows[0]).photo_count).toBe(1);
  });
});

test('OCR is merged onto the photo by sha256, from mcp-content.db', async () => {
  await withRollback(async (client) => {
    await runImportInto(client, await buildImportFixture());
    const { rows } = await client.query<{ ocr_text: string | null }>(
      'SELECT ocr_text FROM pipeline.photo WHERE cloud_asset_id = $1', [id('a')]);
    expect(must(rows[0]).ocr_text).toBe('FRUIT STAND');
  });
});

test('a hand-saisi ref.album_span overrides the album name prefix', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO ref.album_span (album_path, date_from, date_to)
      VALUES ('set/2002', '2002-06-01', '2002-06-30')`);
    await runImportInto(client, await buildImportFixture());

    const { rows } = await client.query<{ span_from: string; span_to: string; span_presumed: boolean }>(
      `SELECT span_from, span_to, span_presumed FROM pipeline.album WHERE path = 'set/2002'`);
    expect(must(rows[0]).span_from).toBe('2002-06-01');
    expect(must(rows[0]).span_presumed).toBe(false);
  });
});

test('IDEMPOTENCE — two imports on unchanged sources produce the same photo count and cascade', async () => {
  await withRollback(async (client) => {
    const sources = await buildImportFixture();
    const first = await runImportInto(client, sources);
    const second = await runImportInto(client, sources);

    expect(second.photos).toBe(first.photos);
    expect(second.cascade).toEqual(first.cascade);
    const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM pipeline.photo');
    expect(must(rows[0]).n).toBe(first.photos);
  });
});
