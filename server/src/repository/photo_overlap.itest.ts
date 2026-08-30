import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { listPhotosWithOverlap } from './photo_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

test('a date-based match (passage) decorates the photo with a real OverlapInfo and a real summary', async () => {
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

    const result = await listPhotosWithOverlap(client, { scope: 'all', overlapsTextKind: 'passage', overlapsTextId: 'doc/p1' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.overlap.rule).toBe('passage');
    expect(result.items[0]?.overlap.photoSpanDays).toBe(0);
    expect(result.items[0]?.overlap.textSpanDays).toBe(10);
    expect(result.overlapSummary).toEqual({
      matchCount: 1, windowDays: 10, datedToDayCount: 1, datedToMonthCount: 0, datedToYearCount: 0, undatedCount: 0,
    });
  });
});

test('a web_caption match decorates with a zero-span identity, even on an UNDATED photo', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'none')`, [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO app.web_gallery_link (sha256, page, image_path, caption, distance, margin, verified)
      VALUES ($1, '2003/gal.htm', 'p01.jpg', 'Le port au matin', 4, 8, null)`, ['b'.repeat(64)]);

    const result = await listPhotosWithOverlap(client, {
      scope: 'all', overlapsTextKind: 'web_caption', overlapsTextId: `${'b'.repeat(64)}:p01.jpg`,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.overlap).toEqual({
      rule: 'gallery_match', photoSpanDays: 0, textSpanDays: 0, totalSpanDays: 0, distanceToCentreDays: 0,
    });
    expect(result.overlapSummary).toEqual({
      matchCount: 1, windowDays: 0, datedToDayCount: 0, datedToMonthCount: 0, datedToYearCount: 0, undatedCount: 1,
    });
  });
});

test('overlapSummary breaks down MULTIPLE matched photos by precision — the contract\'s own example', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('doc', 'handwritten', 'Doc', false)`);
    await client.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence, covers_start, covers_end, covers_rule)
      VALUES ('passage', 'doc/p1', 'doc', 1, 'p1', 'transcribed', '2000-01-01', '2000-02-10', 'passage')`);
    // Un jour, un mois, une année — les trois précisions dans la même fenêtre.
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES
        ('${'a'.repeat(32)}', '${'1'.repeat(64)}', 'x/a.jpg', 'a.jpg', 'jpg', 'exif',
         'annotation', '2000-01-15', '2000-01-15', 'day'),
        ('${'b'.repeat(32)}', '${'2'.repeat(64)}', 'x/b.jpg', 'b.jpg', 'jpg', 'folder-month',
         'album_month', '2000-01-01', '2000-01-31', 'month'),
        ('${'c'.repeat(32)}', '${'3'.repeat(64)}', 'x/c.jpg', 'c.jpg', 'jpg', 'folder-month',
         'album_year', '2000-01-01', '2000-12-31', 'year')`);

    const result = await listPhotosWithOverlap(client, { scope: 'all', overlapsTextKind: 'passage', overlapsTextId: 'doc/p1' });
    expect(result.overlapSummary).toMatchObject({ matchCount: 3, datedToDayCount: 1, datedToMonthCount: 1, datedToYearCount: 1 });
  });
});
