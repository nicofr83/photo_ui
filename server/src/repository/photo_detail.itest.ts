import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { getPhotoDetail } from './photo_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

test('returns null for an id that does not exist, never throws', async () => {
  await withRollback(async (client) => {
    expect(await getPhotoDetail(client, 'f'.repeat(32))).toBeNull();
  });
});

test('fileSize is a real number, not the string a bare bigint driver would give', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    // Un vrai TIFF de 872 Mo (cf. `docs/superpowers/plans/2026-08-28-backend.md`,
    // « Ce qui reste à faire ») : assez gros pour dépasser un `int32`, la
    // raison même pour laquelle la colonne est `bigint`.
    const fileSize = 872_000_000;
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source, file_size)
      VALUES ($1, $2, 'x/p.tiff', 'p.tiff', 'tiff', 'none', $3)`, [id, 'b'.repeat(64), fileSize]);

    const photo = await getPhotoDetail(client, id);
    expect(photo?.fileSize).toBe(fileSize);
    expect(typeof photo?.fileSize).toBe('number');
  });
});

test('proposal and doubt are FIRST-LEVEL fields, never folded into the date', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'folder-month',
              'album_month', '2000-12-01', '2000-12-31', 'month')`, [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.dating_proposal
      (cloud_asset_id, proposed_date, date_source, confidence, evidence_entry_ids, span_hours)
      VALUES ($1, '2000-12-20', 'logbook-bracket', 'proposed', ARRAY['logbook/p001/019'], 407.75)`, [id]);
    await client.query(`INSERT INTO pipeline.dating_doubt (cloud_asset_id, reason, album_path, candidates)
      VALUES ($1, 'several-visits', 'set/x', '[]')`, [id]);

    const photo = await getPhotoDetail(client, id);
    expect(photo?.date?.source).toBe('album_month');
    expect(photo?.proposal).not.toBeNull();
    expect(photo?.proposal?.date.source).toBe('logbook_bracket');
    expect(photo?.proposal?.evidenceEntryIds).toEqual(['logbook/p001/019']);
    expect(photo?.doubt?.reason).toBe('several-visits');
  });
});

test('THE CORRECTION at the display layer — a "manual" dating.proposal never appears as a rank-3 proposal', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'folder-month',
              'album_month', '2000-12-01', '2000-12-31', 'month')`, [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.dating_proposal
      (cloud_asset_id, proposed_date, date_source, confidence, evidence_entry_ids)
      VALUES ($1, '1998-08-23', 'manual', 'manual', '{}')`, [id]);

    const photo = await getPhotoDetail(client, id);
    expect(photo?.proposal).toBeNull();
  });
});

test('a doubt reason is DATA — an unknown one travels with a null label, it does not break', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'none')`, [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.dating_doubt (cloud_asset_id, reason, album_path, candidates)
      VALUES ($1, 'une-raison-inedite', 'set/x', '[]')`, [id]);

    const photo = await getPhotoDetail(client, id);
    expect(photo?.doubt).toEqual({ reason: 'une-raison-inedite', label: null, albumPath: 'set/x', candidates: [] });
  });
});

test('a labelled doubt reason carries its French label from ref.doubt_reason', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO ref.doubt_reason (reason, label)
      VALUES ('several-visits', 'plusieurs séjours possibles')`);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'none')`, [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.dating_doubt (cloud_asset_id, reason, album_path, candidates)
      VALUES ($1, 'several-visits', 'set/x', '[]')`, [id]);

    const photo = await getPhotoDetail(client, id);
    expect(photo?.doubt?.label).toBe('plusieurs séjours possibles');
  });
});

test('albumPaths carries EVERY membership, not just the primary one', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.album (path, album_name, in_perimeter, span_from, span_to, span_presumed)
      VALUES ('set/main', 'x', true, '2000-12-01', '2000-12-31', true)`);
    await client.query(`INSERT INTO pipeline.album (path, album_name, in_perimeter, span_from, span_to, span_presumed)
      VALUES ('set/second', 'y', true, '2000-12-01', '2000-12-31', true)`);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source, album_path)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'none', 'set/main')`, [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.photo_album (cloud_asset_id, album_path, is_primary)
      VALUES ($1, 'set/main', true), ($1, 'set/second', false)`, [id]);

    const photo = await getPhotoDetail(client, id);
    expect([...(photo?.albumPaths ?? [])].sort()).toEqual(['set/main', 'set/second']);
  });
});

test('tags carry their confidence, NULL included — the doubt includes', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.tag (name, kind) VALUES ('ruins', 'ai'), ('sunset', 'user')`);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'none')`, [id, 'b'.repeat(64)]);
    await client.query(`INSERT INTO pipeline.photo_tag (cloud_asset_id, tag_name, tag_kind, confidence)
      VALUES ($1, 'ruins', 'ai', 82), ($1, 'sunset', 'user', NULL)`, [id]);

    const photo = await getPhotoDetail(client, id);
    expect([...(photo?.tags ?? [])].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: 'ruins', confidence: 82 }, { name: 'sunset', confidence: null },
    ]);
  });
});

test('overlappingTextCount uses the SAME overlap operator as GET /photos, never inclusion', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit
      (kind, id, document_id, ordinal, body, confidence, covers_start, covers_end, covers_rule)
      VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'Depart', 'transcribed',
              '2000-12-10', '2000-12-15', 'logbook_entry')`);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       resolved_from, resolved_start, resolved_end, resolved_precision)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'folder-month',
              'album_month', '2000-12-01', '2000-12-31', 'month')`, [id, 'b'.repeat(64)]);

    const photo = await getPhotoDetail(client, id);
    expect(photo?.overlappingTextCount).toBe(1);
  });
});

test('caption is always null — the captioning pass has never run', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'none')`, [id, 'b'.repeat(64)]);

    const photo = await getPhotoDetail(client, id);
    expect(photo?.caption).toBeNull();
  });
});

test('the exif block carries every field independently, including all-null', async () => {
  await withRollback(async (client) => {
    const id = 'a'.repeat(32);
    await client.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
       camera_make, camera_model, iso, aperture)
      VALUES ($1, $2, 'x/p.jpg', 'p.jpg', 'jpg', 'none', 'Nikon', 'D70', 200, 5.6)`, [id, 'b'.repeat(64)]);

    const photo = await getPhotoDetail(client, id);
    expect(photo?.exif).toEqual({
      cameraMake: 'Nikon', cameraModel: 'D70', lens: null, iso: 200, aperture: 5.6,
      shutter: null, focalLength: null, altitude: null,
    });
  });
});
