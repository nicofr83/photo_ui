import { expect, test } from 'vitest';

import { must } from '../../test/helpers/assert.ts';
import { withRollback } from '../../test/helpers/db.ts';
import { copyRows, formatTextArray } from './import_repository.ts';

function* asyncRows(rows: readonly (readonly unknown[])[]): Generator<readonly unknown[]> {
  yield* rows;
}

test('copies plain rows through COPY FROM STDIN', async () => {
  await withRollback(async (client) => {
    await client.query('CREATE TEMP TABLE t_copy (id int, label text)');

    const count = await copyRows(client, 't_copy', ['id', 'label'], asyncRows([[1, 'a'], [2, 'b']]));

    expect(count).toBe(2);
    const { rows } = await client.query<{ id: number; label: string }>(
      'SELECT id, label FROM t_copy ORDER BY id');
    expect(rows).toEqual([{ id: 1, label: 'a' }, { id: 2, label: 'b' }]);
  });
});

test('a synchronous iterable works too, not just an async generator', async () => {
  await withRollback(async (client) => {
    await client.query('CREATE TEMP TABLE t_copy_sync (id int)');
    const count = await copyRows(client, 't_copy_sync', ['id'], [[1], [2], [3]]);
    expect(count).toBe(3);
  });
});

test('null becomes \\N, not the literal string "null"', async () => {
  await withRollback(async (client) => {
    await client.query('CREATE TEMP TABLE t_null (id int, label text)');
    await copyRows(client, 't_null', ['id', 'label'], asyncRows([[1, null]]));

    const { rows } = await client.query<{ label: string | null }>('SELECT label FROM t_null');
    expect(must(rows[0]).label).toBeNull();
  });
});

test('a real tab, newline and backslash inside a value survive intact', async () => {
  await withRollback(async (client) => {
    await client.query('CREATE TEMP TABLE t_escape (id int, remark text)');
    const remark = 'cap\tmis\\à\nl\'eau';
    await copyRows(client, 't_escape', ['id', 'remark'], asyncRows([[1, remark]]));

    const { rows } = await client.query<{ remark: string }>('SELECT remark FROM t_escape');
    expect(must(rows[0]).remark).toBe(remark);
  });
});

test('an accented value round-trips exactly — no re-encoding along the way', async () => {
  await withRollback(async (client) => {
    await client.query('CREATE TEMP TABLE t_accent (id int, name text)');
    await copyRows(client, 't_accent', ['id', 'name'], asyncRows([[1, 'Algès']]));

    const { rows } = await client.query<{ name: string }>('SELECT name FROM t_accent');
    expect(must(rows[0]).name).toBe('Algès');
  });
});

test('an empty row set copies zero rows without erroring', async () => {
  await withRollback(async (client) => {
    await client.query('CREATE TEMP TABLE t_empty (id int)');
    expect(await copyRows(client, 't_empty', ['id'], asyncRows([]))).toBe(0);
  });
});

test('a pre-formatted array literal (via formatTextArray) round-trips through a text[] column', async () => {
  await withRollback(async (client) => {
    await client.query('CREATE TEMP TABLE t_arr (id int, tags text[])');
    await copyRows(client, 't_arr', ['id', 'tags'], asyncRows([[1, formatTextArray(['a', 'b'])]]));

    const { rows } = await client.query<{ tags: string[] }>('SELECT tags FROM t_arr');
    expect(must(rows[0]).tags).toEqual(['a', 'b']);
  });
});
