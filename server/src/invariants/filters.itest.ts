import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import type { PoolClient } from '../db/pool.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';
import { listPhotos } from '../repository/photo_repository.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

async function insertPhoto(client: PoolClient, overrides: Record<string, unknown>): Promise<void> {
  const row = {
    cloud_asset_id: 'a'.repeat(32), sha256: 'b'.repeat(64),
    relative_path: 'set/2000-12/photo.jpg', file_name: 'photo.jpg', format: 'jpg',
    raw_date_source: 'folder-month', album_path: 'set/2000-12', group_name: null,
    resolved_from: 'album_month', resolved_start: '2000-12-01', resolved_end: '2000-12-31',
    resolved_precision: 'month',
    ...overrides,
  };
  const columns = Object.keys(row);
  await client.query(
    `INSERT INTO pipeline.photo (${columns.join(', ')})
     VALUES (${columns.map((_, i) => `$${String(i + 1)}`).join(', ')})`,
    Object.values(row),
  );

  // Le filtre de portée et `albumPath` interrogent le LIEN, jamais la colonne
  // `album_path` de `photo` directement — sans cette ligne, aucun test de
  // portée ne vérifierait ce qu'il prétend vérifier. `row.album_path` est
  // typé `string` par le littéral de base, mais `overrides` peut vraiment le
  // mettre à `null` à l'exécution — d'où le passage par `unknown`.
  const albumPath = row.album_path as unknown;
  if (albumPath !== null && albumPath !== undefined) {
    await client.query(
      `INSERT INTO pipeline.photo_album (cloud_asset_id, album_path, is_primary)
       VALUES ($1, $2, true) ON CONFLICT DO NOTHING`,
      [row.cloud_asset_id, albumPath],
    );
  }
}

async function insertAlbum(client: PoolClient, path: string, inPerimeter = true): Promise<void> {
  await client.query(
    `INSERT INTO pipeline.album (path, album_name, in_perimeter, span_from, span_to, span_presumed)
     VALUES ($1, 'x', $2, '2000-12-01', '2000-12-31', true)
     ON CONFLICT DO NOTHING`, [path, inPerimeter]);
}

test('INVARIANT 3 — a date filter OVERLAPS, it never requires inclusion — the 273 case', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/2000-12');
    await insertPhoto(client, {});

    const strict = await listPhotos(client, {
      dateFrom: '2000-12-01', dateTo: '2000-12-20', scope: 'all',
    });
    // Chevauchement : l'album entier [2000-12-01, 2000-12-31] chevauche le
    // filtre [2000-12-01, 2000-12-20], même si son intervalle DÉBORDE.
    expect(strict.total).toBeGreaterThan(0);
  });
});

test('INVARIANT — a date filter that does not overlap AT ALL excludes the photo', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/2000-12');
    await insertPhoto(client, {});

    const result = await listPhotos(client, { dateFrom: '1990-01-01', dateTo: '1990-01-31', scope: 'all' });
    expect(result.total).toBe(0);
  });
});

test('a tag with NULL confidence is never discarded — the doubt includes', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/2000-12');
    await insertPhoto(client, {});
    await client.query(`INSERT INTO pipeline.tag (name, kind) VALUES ('un-mot-cle-user', 'user')`);
    await client.query(
      `INSERT INTO pipeline.photo_tag (cloud_asset_id, tag_name, tag_kind, confidence)
       VALUES ($1, 'un-mot-cle-user', 'user', NULL)`, ['a'.repeat(32)]);

    const result = await listPhotos(client, { tag: ['un-mot-cle-user'], scope: 'all' });
    expect(result.total).toBe(1);
  });
});

test('scope defaults to hierarchy — an out-of-perimeter photo is excluded by default', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/junk', false);
    await insertPhoto(client, { album_path: 'set/junk', cloud_asset_id: 'c'.repeat(32), sha256: 'd'.repeat(64) });

    const result = await listPhotos(client, {});
    expect(result.total).toBe(0);

    const all = await listPhotos(client, { scope: 'all' });
    expect(all.total).toBe(1);
  });
});

test('country/city search is generous — album_path and group_name answer too', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/belize-trip');
    await insertPhoto(client, { album_path: 'set/belize-trip', city: null, country_raw: null });

    const result = await listPhotos(client, { city: ['Belize'], scope: 'all' });
    expect(result.total).toBe(1);
    expect(result.items[0]?.matchedOn).toContainEqual({ field: 'album_path', value: 'set/belize-trip' });
  });
});

test('an unmatched OPEN-vocabulary value is 0 results, reported, never a 400', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/2000-12');
    await insertPhoto(client, {});

    const result = await listPhotos(client, { tag: ['licorne'], scope: 'all' });
    expect(result.total).toBe(0);
    expect(result.filters.unmatchedValues).toContainEqual(
      expect.objectContaining({ parameter: 'tag', value: 'licorne' }));
  });
});

test('total and the transported page are two different things', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/2000-12');
    for (const c of ['a', 'c', 'd', 'e', 'f', 'g']) {
      await insertPhoto(client, { cloud_asset_id: c.repeat(32), sha256: c.repeat(64) });
    }
    const result = await listPhotos(client, { scope: 'all', limit: 5 });
    expect(result.items).toHaveLength(5);
    expect(result.total).toBe(6);
    expect(result.total - result.items.length).toBeGreaterThan(0);
  });
});

test('a photo with NO date sorts to the end under date_asc, never crashes the ORDER BY', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/2000-12');
    await insertPhoto(client, {});
    await insertPhoto(client, {
      cloud_asset_id: 'c'.repeat(32), sha256: 'd'.repeat(64), album_path: null,
      resolved_from: null, resolved_start: null, resolved_end: null, resolved_precision: null,
      raw_date_source: 'none',
    });

    const result = await listPhotos(client, { scope: 'all', sort: 'date_asc' });
    expect(result.items).toHaveLength(2);
    expect(result.items.at(-1)?.date).toBeNull();
  });
});

test('tagMinConfidence narrows a confident tag but STILL never excludes a NULL-confidence one', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/2000-12');
    await insertPhoto(client, {});   // 'a'*32
    await insertPhoto(client, { cloud_asset_id: 'c'.repeat(32), sha256: 'd'.repeat(64) });
    await client.query(`INSERT INTO pipeline.tag (name, kind) VALUES ('ruins', 'ai')`);
    // photo a : confiance 80 (passe un plancher de 70) ; photo c : confiance NULL (jamais écartée).
    await client.query(`INSERT INTO pipeline.photo_tag (cloud_asset_id, tag_name, tag_kind, confidence)
                        VALUES ($1, 'ruins', 'ai', 80)`, ['a'.repeat(32)]);
    await client.query(`INSERT INTO pipeline.photo_tag (cloud_asset_id, tag_name, tag_kind, confidence)
                        VALUES ($1, 'ruins', 'ai', NULL)`, ['c'.repeat(32)]);

    const result = await listPhotos(client, { scope: 'all', tag: ['ruins'], tagMinConfidence: 70 });
    expect(result.total).toBe(2);
    expect(result.filters.applied).toContainEqual({ parameter: 'tagMinConfidence', values: ['70'], broadened: false });
  });
});

test('tagMinConfidence DOES exclude a tag whose confidence falls below the floor', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/2000-12');
    await insertPhoto(client, {});
    await client.query(`INSERT INTO pipeline.tag (name, kind) VALUES ('ruins', 'ai')`);
    await client.query(`INSERT INTO pipeline.photo_tag (cloud_asset_id, tag_name, tag_kind, confidence)
                        VALUES ($1, 'ruins', 'ai', 40)`, ['a'.repeat(32)]);

    const result = await listPhotos(client, { scope: 'all', tag: ['ruins'], tagMinConfidence: 70 });
    expect(result.total).toBe(0);
  });
});

test('hasOcr and hasCaption both filter true and false', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/2000-12');
    await insertPhoto(client, { ocr_text: 'ROBERT IS HERE' });
    await insertPhoto(client, { cloud_asset_id: 'c'.repeat(32), sha256: 'd'.repeat(64) });
    await client.query(`INSERT INTO app.photo_caption (sha256, caption, model, prompt_version)
                        VALUES ($1, 'une légende', 'm', 'v1')`, ['b'.repeat(64)]);

    expect((await listPhotos(client, { scope: 'all', hasOcr: true })).total).toBe(1);
    expect((await listPhotos(client, { scope: 'all', hasOcr: false })).total).toBe(1);
    expect((await listPhotos(client, { scope: 'all', hasCaption: true })).total).toBe(1);
    expect((await listPhotos(client, { scope: 'all', hasCaption: false })).total).toBe(1);
  });
});

test('q — full text search finds a photo by its album name, and unmatched-noise falls back to null', async () => {
  await withRollback(async (client) => {
    // Un espace avant « Tikal », comme les vrais noms d'album réels
    // ("2004-03- visite de Tikal") : "2000-12-Tikal" collé sans espace
    // tokenise en UN SEUL lexème sous ce parseur, mesuré séparément.
    await insertAlbum(client, 'set/2000-12 Tikal');
    await insertPhoto(client, { album_path: 'set/2000-12 Tikal' });

    const found = await listPhotos(client, { scope: 'all', q: 'Tikal' });
    expect(found.total).toBe(1);

    const noise = await listPhotos(client, { scope: 'all', q: String.fromCharCode(0) });
    expect(noise.total).toBe(0);
    expect(noise.filters.unmatchedValues).toContainEqual(
      expect.objectContaining({ parameter: 'q' }));
  });
});

test('overlapsTextKind+overlapsTextId finds a photo whose resolved_range overlaps the text window', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/2000-12');
    await insertPhoto(client, {});
    await client.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                        VALUES ('logbook', 'handwritten', 'Journal', true)`);
    await client.query(`INSERT INTO pipeline.text_unit
      (kind, id, document_id, ordinal, body, confidence, covers_start, covers_end, covers_rule)
      VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'Depart', 'transcribed',
              '2000-12-10', '2000-12-15', 'logbook_entry')`);

    const result = await listPhotos(client, {
      scope: 'all', overlapsTextKind: 'log_entry', overlapsTextId: 'logbook/p001/001',
    });
    expect(result.total).toBe(1);
  });
});

test('inTask and notInTask are opposite, checked against app.task_image', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/2000-12');
    await insertPhoto(client, {});
    await client.query(`INSERT INTO app.task (slug, title) VALUES ('transat', 'La transat')`);
    await client.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position)
                        VALUES ('transat', $1, 1)`, ['a'.repeat(32)]);

    expect((await listPhotos(client, { scope: 'all', inTask: ['transat'] })).total).toBe(1);
    expect((await listPhotos(client, { scope: 'all', notInTask: ['transat'] })).total).toBe(0);
  });
});

test('every sort order runs without error and returns the same set', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/2000-12');
    await insertPhoto(client, { aesthetics_score: 50 });
    await insertPhoto(client, { cloud_asset_id: 'c'.repeat(32), sha256: 'd'.repeat(64), aesthetics_score: 80 });

    for (const sort of ['date_asc', 'date_desc', 'aesthetics_desc', 'album', 'overlap'] as const) {
      const result = await listPhotos(client, { scope: 'all', sort });
      expect(result.items).toHaveLength(2);
    }
  });
});

test('out_of_hierarchy scope is the mirror of hierarchy', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/2000-12', true);
    await insertPhoto(client, {});
    await insertAlbum(client, 'set/junk', false);
    await insertPhoto(client, { cloud_asset_id: 'c'.repeat(32), sha256: 'd'.repeat(64), album_path: 'set/junk' });

    expect((await listPhotos(client, { scope: 'out_of_hierarchy' })).total).toBe(1);
    expect((await listPhotos(client, { scope: 'hierarchy' })).total).toBe(1);
  });
});

test('albumPath filters to an exact known album, and reports an unknown one as unmatched', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/2000-12');
    await insertPhoto(client, {});

    const result = await listPhotos(client, { scope: 'all', albumPath: ['set/2000-12', 'set/inexistant'] });
    expect(result.total).toBe(1);
    expect(result.filters.unmatchedValues).toContainEqual(
      expect.objectContaining({ parameter: 'albumPath', value: 'set/inexistant' }));
  });
});

test('person matches insensitive to accents and case', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/2000-12');
    await insertPhoto(client, {});
    await client.query(`INSERT INTO pipeline.person (name) VALUES ('Algès')`);
    await client.query(`INSERT INTO pipeline.photo_person (cloud_asset_id, person_name)
                        VALUES ($1, 'Algès')`, ['a'.repeat(32)]);

    const result = await listPhotos(client, { scope: 'all', person: ['ALGES'] });
    expect(result.total).toBe(1);
  });
});

test('offset pages past the end of the result set', async () => {
  await withRollback(async (client) => {
    await insertAlbum(client, 'set/2000-12');
    await insertPhoto(client, {});

    const result = await listPhotos(client, { scope: 'all', limit: 5, offset: 10 });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(1);
  });
});
