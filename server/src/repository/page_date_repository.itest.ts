import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { recomputePageDates } from './page_date_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

test('a page with a dated log_entry is dated by its register', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('logbook', 'handwritten', 'x', true)`);
    await client.query(`INSERT INTO pipeline.page (id, document_id, ordinal, image_relpath, width, height)
                        VALUES ('logbook/p001', 'logbook', 1, 'p001.jpg', 810, 1250)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, page_id, ordinal, body, confidence, date_source, date_start, date_end)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 'logbook/p001', 1, 'x', 'transcribed', 'log_entry_date', '1998-07-09', '1998-07-09')`);

    const count = await recomputePageDates(client);
    expect(count).toBe(1);

    const { rows } = await client.query<{ source: string; date_start: string }>(
      `SELECT source, date_start::text FROM app.page_date WHERE page_id = 'logbook/p001'`);
    expect(rows[0]).toEqual({ source: 'register', date_start: '1998-07-09' });
  });
});

test('a page with only passage dates, no log_entry — dated by its notes (Ma vie\'s own shape, no special case)', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('ma-vie', 'handwritten', 'x', true)`);
    await client.query(`INSERT INTO pipeline.page (id, document_id, ordinal, image_relpath, width, height)
                        VALUES ('ma-vie/p001', 'ma-vie', 1, 'p001.jpg', 810, 1250)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, page_id, ordinal, body, confidence, date_source, date_start, date_end)
                        VALUES ('passage', 'ma-vie/p001/001', 'ma-vie', 'ma-vie/p001', 1, 'x', 'transcribed', 'passage_date_from', '1999-08-04', '1999-08-04')`);

    await recomputePageDates(client);

    const { rows } = await client.query<{ source: string }>(`SELECT source FROM app.page_date WHERE page_id = 'ma-vie/p001'`);
    expect(rows[0]?.source).toBe('notes');
  });
});

test('a page with neither inherits the previous one, marked carried — never across documents', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES
      ('logbook', 'handwritten', 'x', true), ('ma-vie', 'handwritten', 'y', true)`);
    await client.query(`INSERT INTO pipeline.page (id, document_id, ordinal, image_relpath, width, height) VALUES
      ('logbook/p001', 'logbook', 1, 'p.jpg', 1, 1), ('logbook/p002', 'logbook', 2, 'p.jpg', 1, 1),
      ('ma-vie/p001', 'ma-vie', 1, 'p.jpg', 1, 1)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, page_id, ordinal, body, confidence, date_source, date_start, date_end)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 'logbook/p001', 1, 'x', 'transcribed', 'log_entry_date', '1999-08-04', '1999-08-04')`);
    // `logbook/p002` n'a AUCUN texte : hérite de p001.
    // `ma-vie/p001` n'a AUCUN texte non plus, mais c'est le PREMIER de son document : reste sans date.

    await recomputePageDates(client);

    const { rows: p002 } = await client.query<{ source: string; date_start: string }>(
      `SELECT source, date_start::text FROM app.page_date WHERE page_id = 'logbook/p002'`);
    expect(p002[0]).toEqual({ source: 'carried', date_start: '1999-08-04' });

    const { rows: maVieP001 } = await client.query(`SELECT 1 FROM app.page_date WHERE page_id = 'ma-vie/p001'`);
    expect(maVieP001).toEqual([]);
  });
});

test('is idempotent — a stale row from a previous run never lingers', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('logbook', 'handwritten', 'x', true)`);
    await client.query(`INSERT INTO pipeline.page (id, document_id, ordinal, image_relpath, width, height)
                        VALUES ('logbook/p001', 'logbook', 1, 'p.jpg', 1, 1)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, page_id, ordinal, body, confidence, date_source, date_start, date_end)
                        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 'logbook/p001', 1, 'x', 'transcribed', 'log_entry_date', '1998-07-09', '1998-07-09')`);
    await recomputePageDates(client);

    // La date change, comme après une re-transcription : un second appel doit remplacer, jamais s'accumuler.
    await client.query(`UPDATE pipeline.text_unit SET date_start = '1998-08-01', date_end = '1998-08-01' WHERE id = 'logbook/p001/001'`);
    await recomputePageDates(client);

    const { rows } = await client.query<{ date_start: string }>(`SELECT date_start::text FROM app.page_date WHERE page_id = 'logbook/p001'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.date_start).toBe('1998-08-01');
  });
});

test('a page with no upstream text at all, first in its document, gets no row', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('logbook', 'handwritten', 'x', true)`);
    await client.query(`INSERT INTO pipeline.page (id, document_id, ordinal, image_relpath, width, height)
                        VALUES ('logbook/p001', 'logbook', 1, 'p.jpg', 1, 1)`);

    const count = await recomputePageDates(client);
    expect(count).toBe(0);
  });
});
