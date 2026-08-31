import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { putCorrection } from './text_repository.ts';
import { getTextDateFacets } from './text_facets.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

async function insertDatedText(
  client: Parameters<typeof getTextDateFacets>[0], id: string, documentId: string, date: string,
): Promise<void> {
  await client.query(`INSERT INTO pipeline.text_unit
    (kind, id, document_id, ordinal, body, confidence, date_source, date_start, date_end)
    VALUES ('passage', $1, $2, 1, 'x', 'transcribed', 'passage_date_from', $3, $3)`, [id, documentId, date]);
}

test('a bucket carries one row per year/month/day the data actually contains — never the twelve months', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('ma-vie', 'handwritten', 'x', true)`);
    await insertDatedText(client, 'ma-vie/1', 'ma-vie', '1999-08-04');
    await insertDatedText(client, 'ma-vie/2', 'ma-vie', '1999-08-06');
    await insertDatedText(client, 'ma-vie/3', 'ma-vie', '1999-11-01');

    const facets = await getTextDateFacets(client, 'ma-vie');
    expect(facets.years).toEqual([{ value: '1999', count: 3 }]);
    expect(facets.months).toEqual([{ value: '1999-08', count: 2 }, { value: '1999-11', count: 1 }]);
    expect(facets.days).toEqual([
      { value: '1999-08-04', count: 1 }, { value: '1999-08-06', count: 1 }, { value: '1999-11-01', count: 1 },
    ]);
  });
});

test('an undated text is never counted in any bucket', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('ma-vie', 'handwritten', 'x', true)`);
    await insertDatedText(client, 'ma-vie/1', 'ma-vie', '1999-08-04');
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                        VALUES ('passage', 'ma-vie/2', 'ma-vie', 2, 'sans date', 'transcribed')`);

    const facets = await getTextDateFacets(client, 'ma-vie');
    expect(facets.years).toEqual([{ value: '1999', count: 1 }]);
  });
});

test('without a documentId, facets are computed across the whole library', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES
      ('ma-vie', 'handwritten', 'x', true), ('logbook', 'handwritten', 'x', true)`);
    await insertDatedText(client, 'ma-vie/1', 'ma-vie', '1999-08-04');
    await insertDatedText(client, 'logbook/1', 'logbook', '1998-01-01');

    const facets = await getTextDateFacets(client);
    expect(facets.years.map((b) => b.value)).toEqual(['1998', '1999']);
  });
});

test('a documentId with no dated text at all is an empty envelope, never an error', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('web/x', 'html', 'x', false)`);
    const facets = await getTextDateFacets(client, 'web/x');
    expect(facets).toEqual({ years: [], months: [], days: [] });
  });
});

test('facets read the CORRECTED date, not the upstream one — a cosmetic fix is worse than no fix (team-lead)', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('logbook', 'handwritten', 'x', true)`);
    await insertDatedText(client, 'logbook/x/001', 'logbook', '1999-11-16');

    const before = await getTextDateFacets(client, 'logbook');
    expect(before.years).toEqual([{ value: '1999', count: 1 }]);

    await putCorrection(client, {
      ref: { kind: 'passage', id: 'logbook/x/001' }, text: 'x', date: { start: '1998-11-16', end: '1998-11-16' },
    });
    const after = await getTextDateFacets(client, 'logbook');
    expect(after.years).toEqual([{ value: '1998', count: 1 }]);
  });
});
