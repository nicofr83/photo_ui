import { copyFile, mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, afterAll, beforeEach, describe, expect, test } from 'vitest';

import { runMigrations } from '../../db/migrate.ts';
import { createLog, LogLevel } from '../../log/log.ts';
import { closeTestPool, testPool } from '../../../test/helpers/db.ts';
import { must } from '../../../test/helpers/assert.ts';
import { createSafeFs, type SafeFs } from '../../io/safe_fs.ts';
import { AppError } from '../../contract/error_interface.ts';
import { InFlightRenders } from '../images/in_flight_renders.ts';
import { exportTask, type ExportServiceDeps } from './export_service.ts';

const MIGRATIONS = fileURLToPath(new URL('../../../db/migrations', import.meta.url));
const THUMBS_ROOT = '/Volumes/OWC Envoy Ultra/Pictures/lightroom/work/content-thumbs';

beforeAll(async () => {
  await runMigrations(testPool(), createLog(LogLevel.ERROR), MIGRATIONS);
}, 60_000);

afterAll(async () => { await closeTestPool(); });

let base: string;
let tasksRoot: string;
let originalsRoot: string;
let pagesRoot: string;
let renderCacheRoot: string;
let safeFs: SafeFs;
let deps: ExportServiceDeps;

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'export-service-'));
  tasksRoot = path.join(base, 'tasks');
  originalsRoot = path.join(base, 'originals');
  pagesRoot = path.join(base, 'pages');
  renderCacheRoot = path.join(base, 'render-cache');
  await mkdir(tasksRoot);
  await mkdir(originalsRoot);
  await mkdir(pagesRoot);
  await mkdir(renderCacheRoot);
  safeFs = await createSafeFs([tasksRoot, renderCacheRoot], createLog(LogLevel.ERROR, {}, () => undefined));
  deps = {
    pool: testPool(),
    safeFs,
    tasksRoot,
    pagesRoot,
    imageService: {
      thumbsRoot: THUMBS_ROOT, originalsRoot, renderCacheRoot, safeFs, inFlight: new InFlightRenders(8),
    },
  };
});

async function realThumbSha(): Promise<string> {
  const [firstFile] = await readdir(THUMBS_ROOT);
  return path.basename(must(firstFile, 'THUMBS_ROOT est vide'), '.jpg');
}

describe('exportTask', () => {
  test('throws NOT_FOUND for an unknown task', async () => {
    await expect(exportTask(deps, 'nowhere', {})).rejects.toThrow(AppError);
  });

  test('writes a real image, a manifest and README, for a task with one selected photo', async () => {
    const setup = testPool();
    const sourceSha = await realThumbSha();
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
                       VALUES ('x', $1, 0, 'une note', '{manual}')`, [cloudAssetId]);
    try {
      const report = await exportTask(deps, 'x', {});
      expect(report.imagesWritten).toBe(1);
      expect(report.skippedImages).toEqual([]);
      expect(report.directory).toBe(path.join(tasksRoot, 'x'));

      const imageBytes = await readFile(path.join(report.directory, 'images', `${cloudAssetId}.jpg`));
      expect(imageBytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

      const manifest = JSON.parse(await readFile(report.manifestPath, 'utf8')) as {
        images: { cloud_asset_id: string; user_note: string; selected_because: string[] }[];
        task: { title: string };
      };
      expect(manifest.task.title).toBe('Titre');
      expect(manifest.images).toHaveLength(1);
      expect(manifest.images[0]?.cloud_asset_id).toBe(cloudAssetId);
      expect(manifest.images[0]?.user_note).toBe('une note');
      expect(manifest.images[0]?.selected_because).toEqual(['manual']);

      const readme = await readFile(path.join(report.directory, 'README.md'), 'utf8');
      expect(readme).toContain('Titre');
      await readFile(path.join(report.directory, 'textes', 'notes.md'), 'utf8');
    } finally {
      await setup.query(`DELETE FROM app.task_image WHERE task_slug = 'x'`);
      await setup.query(`DELETE FROM app.task WHERE slug = 'x'`);
      await setup.query(`DELETE FROM pipeline.photo WHERE cloud_asset_id = $1`, [cloudAssetId]);
    }
  });

  test('a target directory that already exists, without overwrite, is 409', async () => {
    const setup = testPool();
    await setup.query(`INSERT INTO app.task (slug, title, brief) VALUES ('x', 'Titre', '')`);
    try {
      await mkdir(path.join(tasksRoot, 'x'));
      await expect(exportTask(deps, 'x', {})).rejects.toMatchObject({ code: 'TARGET_DIRECTORY_EXISTS' });
    } finally {
      await setup.query(`DELETE FROM app.task WHERE slug = 'x'`);
    }
  });

  test('overwrite:true replaces an existing export directory', async () => {
    const setup = testPool();
    await setup.query(`INSERT INTO app.task (slug, title, brief) VALUES ('x', 'Titre', '')`);
    try {
      await mkdir(path.join(tasksRoot, 'x'));
      const { writeFile } = await import('node:fs/promises');
      await writeFile(path.join(tasksRoot, 'x', 'stale.txt'), 'ancien export');

      const report = await exportTask(deps, 'x', { overwrite: true });
      expect(report.directory).toBe(path.join(tasksRoot, 'x'));
      await expect(readFile(path.join(tasksRoot, 'x', 'stale.txt'))).rejects.toThrow();
    } finally {
      await setup.query(`DELETE FROM app.task WHERE slug = 'x'`);
    }
  });

  test('an orphaned image selection is skipped, absent from folder and manifest, cause named with a null expectedPath', async () => {
    const setup = testPool();
    const ghost = 'a'.repeat(32);
    await setup.query(`INSERT INTO app.task (slug, title, brief) VALUES ('x', 'Titre', '')`);
    await setup.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position, selected_because)
                       VALUES ('x', $1, 0, '{manual}')`, [ghost]);
    try {
      const report = await exportTask(deps, 'x', {});
      expect(report.imagesWritten).toBe(0);
      expect(report.skippedImages).toEqual([{ cloudAssetId: ghost, reason: 'SOURCE_FILE_MISSING', expectedPath: null }]);

      const manifest = JSON.parse(await readFile(report.manifestPath, 'utf8')) as { images: unknown[] };
      expect(manifest.images).toEqual([]);
      await expect(readFile(path.join(report.directory, 'images', `${ghost}.jpg`))).rejects.toThrow();
    } finally {
      await setup.query(`DELETE FROM app.task_image WHERE task_slug = 'x'`);
      await setup.query(`DELETE FROM app.task WHERE slug = 'x'`);
    }
  });

  test('a selected photo whose original file is missing on disk is skipped, cause named with a real expectedPath', async () => {
    const setup = testPool();
    const cloudAssetId = 'a'.repeat(32);
    await setup.query(`INSERT INTO pipeline.photo
      (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source)
      VALUES ($1, $2, 'nowhere/p.jpg', 'p.jpg', 'jpg', 'none')`, [cloudAssetId, 'b'.repeat(64)]);
    await setup.query(`INSERT INTO app.task (slug, title, brief) VALUES ('x', 'Titre', '')`);
    await setup.query(`INSERT INTO app.task_image (task_slug, cloud_asset_id, position, selected_because)
                       VALUES ('x', $1, 0, '{manual}')`, [cloudAssetId]);
    try {
      const report = await exportTask(deps, 'x', {});
      expect(report.skippedImages).toEqual([{
        cloudAssetId, reason: 'SOURCE_FILE_MISSING', expectedPath: path.join(originalsRoot, 'nowhere/p.jpg'),
      }]);
    } finally {
      await setup.query(`DELETE FROM app.task_image WHERE task_slug = 'x'`);
      await setup.query(`DELETE FROM app.task WHERE slug = 'x'`);
      await setup.query(`DELETE FROM pipeline.photo WHERE cloud_asset_id = $1`, [cloudAssetId]);
    }
  });

  test('a selected text (added directly, ahead of the not-yet-built endpoint) is exported with text/text_original/date/overlap/covers_images', async () => {
    const setup = testPool();
    const cloudAssetId = 'a'.repeat(32);
    try {
      await setup.query(`INSERT INTO pipeline.photo
        (cloud_asset_id, sha256, relative_path, file_name, format, raw_date_source,
         resolved_from, resolved_start, resolved_end, resolved_precision)
        VALUES ($1, $2, 'nowhere/p.jpg', 'p.jpg', 'jpg', 'folder-month',
                'album_month', '1999-10-14', '1999-10-14', 'day')`, [cloudAssetId, 'b'.repeat(64)]);
      await setup.query(`INSERT INTO pipeline.document (id, kind, title, has_pages)
                         VALUES ('logbook', 'handwritten', 'Journal', false)`);
      await setup.query(`INSERT INTO pipeline.text_unit
        (kind, id, document_id, ordinal, body, confidence, date_source, date_start, date_end,
         covers_start, covers_end, covers_rule)
        VALUES ('log_entry', 'logbook/p001/001', 'logbook', 1, 'Depart a cinq heures', 'transcribed',
                'log_entry_date', '1999-10-14', '1999-10-14', '1999-10-14', '1999-10-16', 'logbook_entry')`);
      await setup.query(`INSERT INTO app.text_correction (text_kind, text_id, corrected_text, original_at_correction)
                         VALUES ('log_entry', 'logbook/p001/001', 'Départ à cinq heures', 'Depart a cinq heures')`);
      await setup.query(`INSERT INTO app.task (slug, title, brief) VALUES ('x', 'Titre', '')`);
      await setup.query(`INSERT INTO app.task_text (task_slug, text_kind, text_id, position)
                         VALUES ('x', 'log_entry', 'logbook/p001/001', 0)`);
      // La photo n'est PAS sélectionnée dans la tâche (aucune ligne app.task_image) : elle ne sera
      // jamais exportée, donc covers_images doit rester vide même si sa fenêtre la couvrirait.

      const report = await exportTask(deps, 'x', {});
      const manifest = JSON.parse(await readFile(report.manifestPath, 'utf8')) as {
        texts: {
          id: string; text: string; text_original: string; corrected: boolean;
          date: { start: string; source: string } | null;
          overlap: { from: string; to: string; span_source: string | null } | null;
          covers_images: string[];
        }[];
      };
      expect(manifest.texts).toHaveLength(1);
      const text = must(manifest.texts[0], 'texte manquant du manifeste');
      expect(text.text).toBe('Départ à cinq heures');
      expect(text.text_original).toBe('Depart a cinq heures');
      expect(text.corrected).toBe(true);
      expect(text.date).toEqual({ start: '1999-10-14', end: '1999-10-14', precision: 'day', kind: 'reading', source: 'log_entry_date', bracket_hours: null });
      expect(text.overlap).toEqual({ from: '1999-10-14', to: '1999-10-16', rule: 'logbook_entry', span_source: null });
      // La photo n'a jamais été exportée (fichier source absent) : covers_images est vide.
      expect(text.covers_images).toEqual([]);

      const journal = await readFile(path.join(report.directory, 'textes', 'journal.md'), 'utf8');
      expect(journal).toContain('Départ à cinq heures');
    } finally {
      await setup.query(`DELETE FROM app.task_text WHERE task_slug = 'x'`);
      await setup.query(`DELETE FROM app.task WHERE slug = 'x'`);
      await setup.query(`DELETE FROM app.text_correction WHERE text_kind = 'log_entry' AND text_id = 'logbook/p001/001'`);
      await setup.query(`DELETE FROM pipeline.text_unit WHERE kind = 'log_entry' AND id = 'logbook/p001/001'`);
      await setup.query(`DELETE FROM pipeline.document WHERE id = 'logbook'`);
      await setup.query(`DELETE FROM pipeline.photo WHERE cloud_asset_id = $1`, [cloudAssetId]);
    }
  });
});
