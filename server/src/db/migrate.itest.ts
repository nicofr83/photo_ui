import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeEach, expect, test } from 'vitest';

import { createLog, LogLevel } from '../log/log.ts';
import { runMigrations } from './migrate.ts';
import { createPool } from './pool.ts';

const pool = createPool(process.env.DATABASE_URL_TEST!);
const log = createLog(LogLevel.ERROR);

afterAll(async () => {
  await pool.query('DROP TABLE IF EXISTS public.schema_migration');
  await pool.query('DROP TABLE IF EXISTS public.m_one, public.m_two');
  await pool.end();
});

beforeEach(async () => {
  await pool.query('DROP TABLE IF EXISTS public.schema_migration');
  await pool.query('DROP TABLE IF EXISTS public.m_one, public.m_two');
});

async function migrationsDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'migrations-'));
  for (const [name, sql] of Object.entries(files)) {
    await writeFile(path.join(dir, name), sql);
  }
  return dir;
}

test('applies files in lexicographic order, not in directory order', async () => {
  // `002` crée une colonne sur la table que `001` crée : l'ordre est la règle.
  const dir = await migrationsDir({
    '002_add_column.sql': 'ALTER TABLE public.m_one ADD COLUMN label text;',
    '001_create.sql': 'CREATE TABLE public.m_one (id int);',
  });

  const applied = await runMigrations(pool, log, dir);

  expect(applied).toEqual(['001_create', '002_add_column']);
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='m_one' ORDER BY column_name`);
  expect(rows.map((r) => r.column_name)).toEqual(['id', 'label']);
});

test('never replays what is already applied — that is the whole job', async () => {
  const dir = await migrationsDir({ '001_create.sql': 'CREATE TABLE public.m_one (id int);' });

  expect(await runMigrations(pool, log, dir)).toEqual(['001_create']);
  // Rejouer un CREATE TABLE lèverait ; ne rien faire est la preuve.
  expect(await runMigrations(pool, log, dir)).toEqual([]);
});

test('applies only what is NEW when a migration is added later', async () => {
  const first = await migrationsDir({ '001_create.sql': 'CREATE TABLE public.m_one (id int);' });
  await runMigrations(pool, log, first);

  const second = await migrationsDir({
    '001_create.sql': 'CREATE TABLE public.m_one (id int);',
    '002_second.sql': 'CREATE TABLE public.m_two (id int);',
  });
  expect(await runMigrations(pool, log, second)).toEqual(['002_second']);
});

test('a failing migration leaves NOTHING behind — it is one transaction', async () => {
  const dir = await migrationsDir({
    '001_create.sql': 'CREATE TABLE public.m_one (id int);',
    '002_broken.sql': 'CREATE TABLE public.m_two (id int); SELECT une_fonction_qui_nexiste_pas();',
  });

  await expect(runMigrations(pool, log, dir)).rejects.toThrow();

  const { rows: applied } = await pool.query(
    'SELECT version FROM public.schema_migration ORDER BY version');
  expect(applied.map((r) => r.version)).toEqual(['001_create']);

  // m_two ne doit pas exister : sa migration a échoué APRÈS l'avoir créée.
  const { rows: tables } = await pool.query(
    `SELECT to_regclass('public.m_two') AS t`);
  expect(tables[0].t).toBeNull();
});

test('ignores files that are not .sql', async () => {
  const dir = await migrationsDir({
    '001_create.sql': 'CREATE TABLE public.m_one (id int);',
    'README.md': 'ceci n\'est pas une migration',
  });

  expect(await runMigrations(pool, log, dir)).toEqual(['001_create']);
});
