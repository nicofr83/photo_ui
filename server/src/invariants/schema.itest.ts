import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool, withRollback } from '../../test/helpers/db.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

/** Une photo minimale : seules les colonnes NOT NULL, plus ce que le test vise. */
async function insertPhoto(
  client: Parameters<Parameters<typeof withRollback>[0]>[0],
  overrides: Record<string, unknown>,
): Promise<void> {
  const row = {
    cloud_asset_id: 'a'.repeat(32),
    sha256: 'b'.repeat(64),
    relative_path: '1998-1999/photo.jpg',
    file_name: 'photo.jpg',
    format: 'jpg',
    raw_date_source: 'folder-month',
    ...overrides,
  };
  const columns = Object.keys(row);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  await client.query(
    `INSERT INTO pipeline.photo (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    Object.values(row),
  );
}

describe('INVARIANT 1 — an inference can never be served as a reading', () => {
  test('the engine REFUSES to write resolved_kind, it is not a naming convention', async () => {
    await withRollback(async (client) => {
      await insertPhoto(client, {
        resolved_from: 'album_month', resolved_start: '2000-12-01',
        resolved_end: '2000-12-31', resolved_precision: 'month',
      });

      await expect(client.query(`UPDATE pipeline.photo SET resolved_kind = 'reading'`))
        .rejects.toThrow(/can only be updated to DEFAULT/);
    });
  });

  test('each of the five sources derives exactly the kind the spec announces', async () => {
    const expected = [
      ['annotation', 'decision'],
      ['exif_arbitrated', 'reading'],
      ['logbook_bracket', 'inference'],
      ['album_month', 'inference'],
      ['album_year', 'inference'],
    ] as const;

    for (const [source, kind] of expected) {
      await withRollback(async (client) => {
        const bounds = source === 'album_year'
          ? { resolved_start: '2002-01-01', resolved_end: '2002-12-31', resolved_precision: 'year' }
          : source === 'album_month'
            ? { resolved_start: '2000-12-01', resolved_end: '2000-12-31', resolved_precision: 'month' }
            : { resolved_start: '1999-03-02', resolved_end: '1999-03-02', resolved_precision: 'day' };

        await insertPhoto(client, { resolved_from: source, ...bounds });
        const { rows } = await client.query('SELECT resolved_kind FROM pipeline.photo');
        expect(rows[0].resolved_kind, `${source} doit donner ${kind}`).toBe(kind);
      });
    }
  });

  test('an unknown resolved_from is REFUSED — never a date without a nature', async () => {
    await withRollback(async (client) => {
      // Des bornes valides, pour ne violer QUE la contrainte visée.
      await expect(insertPhoto(client, {
        resolved_from: 'album_week', resolved_start: '2000-01-01',
        resolved_end: '2000-01-01', resolved_precision: 'day',
      })).rejects.toThrow(/photo_resolved_from_known/);
    });
  });

  test('annotation is the ONLY source of kind decision', async () => {
    await withRollback(async (client) => {
      await insertPhoto(client, {
        resolved_from: 'exif_arbitrated', resolved_start: '1999-03-02',
        resolved_end: '1999-03-02', resolved_precision: 'day',
      });
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM pipeline.photo WHERE resolved_kind = 'decision'`);
      expect(rows[0].n).toBe(0);
    });
  });
});

describe('a month-precision date IS whole months — bounds aligned, width free', () => {
  test('a single whole month passes', async () => {
    await withRollback(async (client) => {
      await insertPhoto(client, {
        resolved_from: 'album_month', resolved_start: '2000-12-01',
        resolved_end: '2000-12-31', resolved_precision: 'month',
      });
    });
  });

  test('a saisi span of SEVENTEEN months passes — the flagship ref.album_span case', async () => {
    await withRollback(async (client) => {
      await insertPhoto(client, {
        resolved_from: 'album_month', resolved_start: '1998-02-01',
        resolved_end: '1999-06-30', resolved_precision: 'month',
      });
    });
  });

  test('an arbitrary day dressed as a month is still REFUSED — nothing was lost', async () => {
    await withRollback(async (client) => {
      await expect(insertPhoto(client, {
        resolved_from: 'album_month', resolved_start: '2004-09-14',
        resolved_end: '2004-09-14', resolved_precision: 'month',
      })).rejects.toThrow(/photo_month_is_whole_month/);
    });
  });

  test('a month that does not start on the 1st is refused', async () => {
    await withRollback(async (client) => {
      await expect(insertPhoto(client, {
        resolved_from: 'album_month', resolved_start: '2000-12-02',
        resolved_end: '2000-12-31', resolved_precision: 'month',
      })).rejects.toThrow(/photo_month_is_whole_month/);
    });
  });

  test('a whole year passes and a ragged one does not', async () => {
    await withRollback(async (client) => {
      await insertPhoto(client, {
        resolved_from: 'album_year', resolved_start: '2002-01-01',
        resolved_end: '2002-12-31', resolved_precision: 'year',
      });
    });
    await withRollback(async (client) => {
      await expect(insertPhoto(client, {
        resolved_from: 'album_year', resolved_start: '2002-01-01',
        resolved_end: '2002-11-30', resolved_precision: 'year',
      })).rejects.toThrow(/photo_year_is_whole_year/);
    });
  });
});

describe('bounds and brackets', () => {
  test('both bounds are set or neither is', async () => {
    await withRollback(async (client) => {
      await expect(insertPhoto(client, {
        resolved_from: 'album_month', resolved_start: '2000-12-01', resolved_precision: 'month',
      })).rejects.toThrow(/photo_bounds_complete/);
    });
  });

  test('an end before its start is refused', async () => {
    await withRollback(async (client) => {
      // C'est le constructeur de `daterange` de la colonne générée qui refuse,
      // AVANT que `photo_bounds_ordered` soit évalué. La ligne est rejetée dans
      // les deux cas ; on assère le refus, pas lequel des deux a parlé.
      await expect(insertPhoto(client, {
        resolved_from: 'exif_arbitrated', resolved_start: '2000-12-31',
        resolved_end: '2000-12-01', resolved_precision: 'day',
      })).rejects.toThrow(/range lower bound must be less than|photo_bounds_ordered/);
    });
  });

  test('a bracket outside rank 3 is refused — a bracket belongs to a proposal', async () => {
    await withRollback(async (client) => {
      await expect(insertPhoto(client, {
        resolved_from: 'exif_arbitrated', resolved_start: '1999-03-02',
        resolved_end: '1999-03-02', resolved_precision: 'day', bracket_hours: 407.75,
      })).rejects.toThrow(/photo_bracket_only_rank3/);
    });
  });

  test('a photo with NO date at all is allowed — the 420 that have none', async () => {
    await withRollback(async (client) => {
      await insertPhoto(client, { raw_date_source: 'none' });
      const { rows } = await client.query(
        'SELECT resolved_kind, resolved_range FROM pipeline.photo');
      expect(rows[0].resolved_kind).toBeNull();
      expect(rows[0].resolved_range).toBeNull();
    });
  });
});

describe('INVARIANT 1 (texts) — a text asserts a day, or nothing', () => {
  async function insertText(
    client: Parameters<Parameters<typeof withRollback>[0]>[0],
    overrides: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO pipeline.document (id, kind, title, has_pages)
       VALUES ('logbook', 'handwritten', 'Journal du bord', true)
       ON CONFLICT DO NOTHING`);
    const row = {
      kind: 'passage', id: 'logbook/p003/001', document_id: 'logbook',
      ordinal: 1, body: 'un texte', confidence: 'transcribed', ...overrides,
    };
    const columns = Object.keys(row);
    await client.query(
      `INSERT INTO pipeline.text_unit (${columns.join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(row),
    );
  }

  // Chaque cas ne viole QU'UNE contrainte : PostgreSQL n'ordonne pas
  // l'évaluation des CHECK, donc une ligne qui en viole deux peut échouer sur
  // l'une ou l'autre, et l'assertion serait instable.
  test('a page window may NEVER be written into a text date', async () => {
    await withRollback(async (client) => {
      await expect(insertText(client, {
        date_source: 'page_window', date_start: '1999-09-23', date_end: '1999-09-23',
      })).rejects.toThrow(/text_date_source_is_a_reading/);
    });
  });

  test('a web_span may never be a text date either', async () => {
    await withRollback(async (client) => {
      await expect(insertText(client, {
        date_source: 'web_span', date_start: '1999-09-01', date_end: '1999-09-01',
      })).rejects.toThrow(/text_date_source_is_a_reading/);
    });
  });

  test('a text date spanning more than one day is refused', async () => {
    await withRollback(async (client) => {
      await expect(insertText(client, {
        date_source: 'passage_date_from', date_start: '1999-09-23', date_end: '1999-09-25',
      })).rejects.toThrow(/text_date_is_a_single_day/);
    });
  });

  test('a date without its source, or a source without its date, is refused', async () => {
    await withRollback(async (client) => {
      await expect(insertText(client, { date_start: '1999-09-23', date_end: '1999-09-23' }))
        .rejects.toThrow(/text_date_complete/);
    });
  });

  test('the two readings pass, and derive kind reading', async () => {
    for (const source of ['passage_date_from', 'log_entry_date']) {
      await withRollback(async (client) => {
        await insertText(client, {
          date_source: source, date_start: '1999-09-23', date_end: '1999-09-23',
        });
        const { rows } = await client.query('SELECT date_kind FROM pipeline.text_unit');
        expect(rows[0].date_kind).toBe('reading');
      });
    }
  });

  test('an undated text carries only its covers window — the normal case', async () => {
    await withRollback(async (client) => {
      await insertText(client, {
        covers_start: '1999-09-23', covers_end: '1999-09-25',
        covers_rule: 'passage', page_span_source: 'carried',
      });
      const { rows } = await client.query(
        'SELECT date_kind, date_start, covers_range FROM pipeline.text_unit');
      expect(rows[0].date_kind).toBeNull();
      expect(rows[0].date_start).toBeNull();
      expect(rows[0].covers_range).toBe('[1999-09-23,1999-09-26)');
    });
  });

  test('the KEY is the pair — the same id in both namespaces coexists', async () => {
    await withRollback(async (client) => {
      await insertText(client, { kind: 'passage', body: 'la prose du haut de page' });
      await insertText(client, { kind: 'log_entry', body: 'Départ Lisbonne - Ecluse' });

      const { rows } = await client.query(
        `SELECT kind, body FROM pipeline.text_unit WHERE id = 'logbook/p003/001' ORDER BY kind`);
      expect(rows).toHaveLength(2);
      expect(rows[0].body).not.toBe(rows[1].body);
    });
  });
});

describe('INVARIANT 6 — no foreign key ever crosses from app or ref into pipeline', () => {
  test('information_schema shows none, and that is what protects human work', async () => {
    const { rows } = await testPool().query(`
      SELECT c.conname AS constraint_name,
             sf.nspname AS from_schema, st.nspname AS to_schema
        FROM pg_constraint c
        JOIN pg_class tf ON tf.oid = c.conrelid
        JOIN pg_namespace sf ON sf.oid = tf.relnamespace
        JOIN pg_class tt ON tt.oid = c.confrelid
        JOIN pg_namespace st ON st.oid = tt.relnamespace
       WHERE c.contype = 'f'
         AND sf.nspname IN ('app', 'ref')
         AND st.nspname = 'pipeline'`);

    expect(rows).toEqual([]);
  });
});

describe('NFC and full text search', () => {
  test('an album typed in NFC finds one stored from an NFD source', async () => {
    await withRollback(async (client) => {
      // La chaîne insérée est NFD, comme macOS l'écrit. L'import normalise.
      const nfd = '1998-1999/1998-02-Maison rose Algès'.normalize('NFC');
      await client.query(
        `INSERT INTO pipeline.album
           (path, album_name, in_perimeter, span_from, span_to, span_presumed)
         VALUES ($1, 'x', true, '1998-02-01', '1998-02-28', true)`, [nfd]);

      const { rows } = await client.query(
        'SELECT count(*)::int AS n FROM pipeline.album WHERE path = $1',
        ['1998-1999/1998-02-Maison rose Algès']);
      expect(rows[0].n).toBe(1);
    });
  });

  test('search_meta is generated, unaccented and French-stemmed', async () => {
    await withRollback(async (client) => {
      await insertPhoto(client, { album_path: '1998-02-Maison rose Algès' });
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM pipeline.photo
          WHERE search_meta @@ to_tsquery('public.fr_unaccent', 'alges')`);
      expect(rows[0].n).toBe(1);
    });
  });

  test('OCR is a SEPARATE vector — merging it with metadata would be a measurable fault', async () => {
    await withRollback(async (client) => {
      await insertPhoto(client, { album_path: 'un album', ocr_text: 'ROBERT IS HERE FRUIT STAND' });
      const { rows } = await client.query(
        `SELECT
           (search_meta @@ to_tsquery('public.fr_unaccent', 'robert')) AS in_meta,
           (search_ocr  @@ to_tsquery('public.fr_unaccent', 'robert')) AS in_ocr
         FROM pipeline.photo`);
      expect(rows[0].in_meta).toBe(false);
      expect(rows[0].in_ocr).toBe(true);
    });
  });
});

describe('the overlap operator', () => {
  test('a filter that ends mid-month still catches the whole-month album — the 273', async () => {
    await withRollback(async (client) => {
      await insertPhoto(client, {
        resolved_from: 'album_month', resolved_start: '2000-12-01',
        resolved_end: '2000-12-31', resolved_precision: 'month',
      });

      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM pipeline.photo
          WHERE resolved_range && daterange($1::date, $2::date, '[]')`,
        ['2000-12-01', '2000-12-20']);
      expect(rows[0].n).toBe(1);
    });
  });
});
