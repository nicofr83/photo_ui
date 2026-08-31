import { copyFile, mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { closeTestPool, testPool } from '../../test/helpers/db.ts';
import { must } from '../../test/helpers/assert.ts';
import { createSafeFs } from '../io/safe_fs.ts';
import { exportTask, type ExportServiceDeps } from '../metier/export/export_service.ts';
import { InFlightRenders } from '../metier/images/in_flight_renders.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));
const THUMBS_ROOT = '/Volumes/OWC Envoy Ultra/Pictures/lightroom/work/content-thumbs';

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

async function fileList(root: string): Promise<readonly string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(path.relative(root, full));
    }
  }
  await walk(root);
  return [...out].sort();
}

/** `task.exported_at` mis à part — le seul champ censé varier entre deux exports du même contenu. */
function manifestWithoutTimestamp(raw: string): unknown {
  const parsed = JSON.parse(raw) as { task: Record<string, unknown> };
  const { exported_at: _exportedAt, ...task } = parsed.task;
  return { ...parsed, task };
}

test('INVARIANT 7 — re-exporting an unchanged task produces a byte-identical tree, exported_at aside', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'invariant7-'));
  const tasksRoot = path.join(base, 'tasks');
  const originalsRoot = path.join(base, 'originals');
  const pagesRoot = path.join(base, 'pages');
  const renderCacheRoot = path.join(base, 'render-cache');
  await mkdir(tasksRoot);
  await mkdir(originalsRoot);
  await mkdir(pagesRoot);
  await mkdir(renderCacheRoot);
  const safeFs = await createSafeFs([tasksRoot, renderCacheRoot], createLog(LogLevel.ERROR, {}, () => undefined));
  // MÊME `deps` pour les deux exports : le cache de rendus (par sha256) doit
  // être partagé, sans quoi une éventuelle métadonnée non déterministe écrite
  // par `sips` casserait l'invariant pour une raison étrangère à l'export lui-même.
  const deps: ExportServiceDeps = {
    pool: testPool(), safeFs, tasksRoot, pagesRoot,
    imageService: {
      thumbsRoot: THUMBS_ROOT, originalsRoot, renderCacheRoot, safeFs, inFlight: new InFlightRenders(8),
    },
  };

  const setup = testPool();
  const [sourceFile] = await readdir(THUMBS_ROOT);
  const sourceSha = path.basename(must(sourceFile, 'THUMBS_ROOT est vide'), '.jpg');
  const cloudAssetId = 'a'.repeat(32);
  await mkdir(path.join(originalsRoot, 'set'));
  await copyFile(path.join(THUMBS_ROOT, `${sourceSha}.jpg`), path.join(originalsRoot, 'set', 'p.jpg'));
  await setup.query(`INSERT INTO pipeline.photo
    (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source, album_path,
     resolved_from, resolved_start, resolved_end, resolved_precision)
    VALUES ($1, $2, 'set/p.jpg', 'p.jpg', 'jpg', 'folder-month', 'set',
            'album_month', '1999-06-01', '1999-06-30', 'month')`, [cloudAssetId, 'b'.repeat(64)]);
  await setup.query(`INSERT INTO app.task (slug, title, brief) VALUES ('x', 'Titre', 'un brief')`);
  await setup.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position, note, selected_because)
                     VALUES ('x', $1, 0, 'une note', '{manual,album}')`, [cloudAssetId]);

  try {
    const first = await exportTask(deps, 'x', { directory: path.join(tasksRoot, 'first') });
    const second = await exportTask(deps, 'x', { directory: path.join(tasksRoot, 'second') });

    expect(await fileList(first.directory)).toEqual(await fileList(second.directory));

    for (const relPath of await fileList(first.directory)) {
      const a = await readFile(path.join(first.directory, relPath));
      const b = await readFile(path.join(second.directory, relPath));
      if (relPath === 'manifest.json') {
        expect(manifestWithoutTimestamp(a.toString('utf8'))).toEqual(manifestWithoutTimestamp(b.toString('utf8')));
      } else {
        expect(a.equals(b)).toBe(true);
      }
    }
  } finally {
    await setup.query(`DELETE FROM app.task_image WHERE task_slug = 'x'`);
    await setup.query(`DELETE FROM app.task WHERE slug = 'x'`);
    await setup.query(`DELETE FROM pipeline.photo WHERE cloud_asset_id = $1`, [cloudAssetId]);
  }
});

test('INVARIANT 7 (V1.7) — a page-derived note and two notes sharing one source still re-export byte-identical, texts[] deduplicated', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'invariant7-v17-'));
  const tasksRoot = path.join(base, 'tasks');
  const originalsRoot = path.join(base, 'originals');
  const pagesRoot = path.join(base, 'pages');
  const renderCacheRoot = path.join(base, 'render-cache');
  await mkdir(tasksRoot);
  await mkdir(originalsRoot);
  await mkdir(pagesRoot);
  await mkdir(renderCacheRoot);
  const safeFs = await createSafeFs([tasksRoot, renderCacheRoot], createLog(LogLevel.ERROR, {}, () => undefined));
  const deps: ExportServiceDeps = {
    pool: testPool(), safeFs, tasksRoot, pagesRoot,
    imageService: {
      thumbsRoot: THUMBS_ROOT, originalsRoot, renderCacheRoot, safeFs, inFlight: new InFlightRenders(8),
    },
  };

  const setup = testPool();
  await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('web/y-doc', 'html', 'Site', false)`);
  await setup.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence) VALUES
    ('passage', 'web/y-doc/001', 'web/y-doc', 1, 'Premier passage.', 'transcribed'),
    ('passage', 'web/y-doc/002', 'web/y-doc', 2, 'Deuxième passage qui suit.', 'transcribed'),
    ('passage', 'web/y-doc/003', 'web/y-doc', 3, 'Troisième, non concerné.', 'transcribed')`);
  await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages) VALUES ('logbook-y', 'handwritten', 'Journal', false)`);
  await setup.query(`INSERT INTO pipeline.text_unit (kind, id, document_id, ordinal, body, confidence)
                     VALUES ('log_entry', 'logbook-y/p001/001', 'logbook-y', 1, 'Depart a cinq heures', 'transcribed')`);
  await setup.query(`INSERT INTO app.task (slug, title, brief) VALUES ('y', 'Titre', 'un brief')`);
  // Aucune n'est attachée par ailleurs (pas de app.task_text) : seule la
  // dérivation les fait entrer dans `texts[]` — exactement le cas visé.
  await setup.query(`INSERT INTO app.task_note (id, task_slug, title, body, derived_from_kind, derived_from_id, derived_text_original)
                     VALUES ('note_page', 'y', 'Une note de page', 'passage.
Deuxième', 'page', 'web/y-doc', 'passage.
Deuxième')`);
  await setup.query(`INSERT INTO app.task_note (id, task_slug, title, body, derived_from_kind, derived_from_id, derived_text_original)
                     VALUES ('note_a', 'y', 'Note A', 'Depart', 'log_entry', 'logbook-y/p001/001', 'Depart a cinq heures')`);
  await setup.query(`INSERT INTO app.task_note (id, task_slug, title, body, derived_from_kind, derived_from_id, derived_text_original)
                     VALUES ('note_b', 'y', 'Note B', 'cinq heures', 'log_entry', 'logbook-y/p001/001', 'Depart a cinq heures')`);

  try {
    const first = await exportTask(deps, 'y', { directory: path.join(tasksRoot, 'first') });
    const second = await exportTask(deps, 'y', { directory: path.join(tasksRoot, 'second') });

    expect(await fileList(first.directory)).toEqual(await fileList(second.directory));

    const firstManifest = JSON.parse(await readFile(path.join(first.directory, 'manifest.json'), 'utf8')) as {
      texts: { id: string }[];
    };
    // Deux passages de web/y-doc (le troisième, hors sélection, en est exclu) +
    // l'entrée de journal partagée par note_a/note_b, UNE seule fois.
    expect(firstManifest.texts.map((t) => t.id).sort()).toEqual([
      'logbook-y/p001/001', 'web/y-doc/001', 'web/y-doc/002',
    ]);

    for (const relPath of await fileList(first.directory)) {
      const a = await readFile(path.join(first.directory, relPath));
      const b = await readFile(path.join(second.directory, relPath));
      if (relPath === 'manifest.json') {
        expect(manifestWithoutTimestamp(a.toString('utf8'))).toEqual(manifestWithoutTimestamp(b.toString('utf8')));
      } else {
        expect(a.equals(b)).toBe(true);
      }
    }
  } finally {
    await setup.query(`DELETE FROM app.task_note WHERE task_slug = 'y'`);
    await setup.query(`DELETE FROM app.task WHERE slug = 'y'`);
    await setup.query(`DELETE FROM pipeline.text_unit WHERE document_id IN ('web/y-doc', 'logbook-y')`);
    await setup.query(`DELETE FROM pipeline.document WHERE id IN ('web/y-doc', 'logbook-y')`);
  }
});
