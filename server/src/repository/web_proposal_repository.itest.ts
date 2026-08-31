import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, test, expect } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { listWebProposals } from './web_proposal_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

test('a document proposes the smallest date among its linked photos, and says what supports it', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source, resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/a.jpg', 'a.jpg', 'jpg', 'exif', 'exif_arbitrated', '2004-10-05', '2004-10-05', 'day'),
             ($3, $4, 'x/b.jpg', 'b.jpg', 'jpg', 'exif', 'exif_arbitrated', '2004-10-13', '2004-10-13', 'day')`,
      ['a'.repeat(32), 'b'.repeat(64), 'c'.repeat(32), 'd'.repeat(64)]);
    await client.query(`INSERT INTO app.web_gallery_link (sha256, page, image_path, distance, margin, verified)
      VALUES ($1, '2003/gal.htm', 'a.jpg', 4, 8, null), ($2, '2003/gal.htm', 'b.jpg', 4, 8, null)`,
      ['b'.repeat(64), 'd'.repeat(64)]);

    const proposals = await listWebProposals(client);
    expect(proposals.get('web/2003/gal')).toEqual({
      date: '2004-10-05', photoCount: 2, datedToDayCount: 2, spanDays: 8, thumbSha256: 'b'.repeat(64),
    });
  });
});

test('the thumbnail is the earliest-dated linked photo — the same one that establishes the proposed date', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source, resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/late.jpg', 'late.jpg', 'jpg', 'exif', 'exif_arbitrated', '2004-10-13', '2004-10-13', 'day'),
             ($3, $4, 'x/early.jpg', 'early.jpg', 'jpg', 'exif', 'exif_arbitrated', '2004-10-05', '2004-10-05', 'day')`,
      ['a'.repeat(32), 'b'.repeat(64), 'c'.repeat(32), 'd'.repeat(64)]);
    // Insérés dans l'ordre alphabétique INVERSE de la date, pour prouver que
    // ce n'est pas l'ordre d'insertion ni `image_path` qui décide.
    await client.query(`INSERT INTO app.web_gallery_link (sha256, page, image_path, distance, margin, verified)
      VALUES ($1, '2003/gal.htm', 'a-late.jpg', 4, 8, null), ($2, '2003/gal.htm', 'z-early.jpg', 4, 8, null)`,
      ['b'.repeat(64), 'd'.repeat(64)]);

    const proposals = await listWebProposals(client);
    expect(proposals.get('web/2003/gal')?.thumbSha256).toBe('d'.repeat(64));
  });
});

test('a fragile proposal says so: a single photo, dated only to the month', async () => {
  await withRollback(async (client) => {
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source, resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/c.jpg', 'c.jpg', 'jpg', 'exif', 'album_month', '2000-12-01', '2000-12-31', 'month')`,
      ['e'.repeat(32), 'f'.repeat(64)]);
    await client.query(`INSERT INTO app.web_gallery_link (sha256, page, image_path, distance, margin, verified)
      VALUES ($1, '2000/photo.html', 'c.jpg', 4, 8, null)`, ['f'.repeat(64)]);

    const proposals = await listWebProposals(client);
    expect(proposals.get('web/2000/photo')).toMatchObject({ photoCount: 1, datedToDayCount: 0 });
  });
});

test('a gallery link whose photo has no resolved date supports no proposal — never an invented date', async () => {
  await withRollback(async (client) => {
    // Le lien existe, mais AUCUNE photo ne porte ce sha256 (ou n'a pas de
    // date résolue) : la jointure interne l'exclut, jamais une entrée à moitié remplie.
    await client.query(`INSERT INTO app.web_gallery_link (sha256, page, image_path, distance, margin, verified)
      VALUES ($1, '2000/orphelin.htm', 'z.jpg', 4, 8, null)`, ['9'.repeat(64)]);

    const proposals = await listWebProposals(client);
    expect(proposals.has('web/2000/orphelin')).toBe(false);
  });
});
