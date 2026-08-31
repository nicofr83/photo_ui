import { randomUUID } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { ErrorCode } from '@shared/enums';
import { AppError } from '../../contract/error_interface.ts';
import type { TaskExportInput, TaskExportReport } from '../../contract/task_interface.ts';
import type { Pool, PoolClient } from '../../db/pool.ts';
import type { SafeFs } from '../../io/safe_fs.ts';
import {
  loadCoversImages, loadExportDocuments, loadExportImages, loadExportTexts, loadPageImageRelpaths,
  loadPagePassages, type ExportPagePassage,
} from '../../repository/export_repository.ts';
import { getTaskDetail, markTaskExported } from '../../repository/task_repository.ts';
import { locatePassagesForSelection } from '../tasks/note_provenance.ts';
import { getRender, type ImageServiceDeps } from '../images/image_service.ts';
import type { RenderFailure } from '../images/render_availability.ts';
import { serialise } from './canonical.ts';
import {
  buildManifest, type ManifestInputImage, type ManifestInputNote, type ManifestInputText,
  type ManifestNoteDerivedFrom,
} from './manifest.ts';

const RENDER_EDGE = 1400;

export interface ExportServiceDeps {
  readonly pool: Pool;
  readonly safeFs: SafeFs;
  readonly tasksRoot: string;
  readonly pagesRoot: string;
  readonly imageService: ImageServiceDeps;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function toMarkdown(title: string, body: readonly string[]): string {
  return [`# ${title}`, '', ...(body.length === 0 ? ['*Rien pour cette tâche.*'] : body)].join('\n');
}

/**
 * Regroupe par SOURCE, comme le dossier livré (§7.4) : `journal.md` (les
 * entrées de journal), `ma-vie.md` (les passages d'un document manuscrit
 * autre que le journal), `site-web.md` (les passages d'un document `html`).
 */
function textFileFor(text: ManifestInputText, documentKind: string): 'journal' | 'ma-vie' | 'site-web' {
  if (text.kind === 'log_entry') return 'journal';
  return documentKind === 'html' ? 'site-web' : 'ma-vie';
}

/**
 * L'export — le SEUL endroit où le backend écrit hors de sa base (tâche 18).
 *
 * Dossier temporaire `TASKS_ROOT/.<slug>.tmp-<uuid>` → rendus → pages →
 * `textes/*.md` → `README.md` → `manifest.json` → `rename` en dernier geste :
 * un export interrompu ne touche jamais la cible, l'export précédent survit.
 */
export async function exportTask(
  deps: ExportServiceDeps, slug: string, input: TaskExportInput,
): Promise<TaskExportReport> {
  const client = await deps.pool.connect();
  let task;
  try {
    task = await getTaskDetail(client, slug);
  } finally {
    client.release();
  }
  if (task === null) {
    throw new AppError(ErrorCode.NOT_FOUND, `tâche introuvable : ${slug}`, 404, { resource: 'task', id: slug });
  }

  const targetDir = input.directory ?? path.join(deps.tasksRoot, slug);
  if (!(input.overwrite ?? false) && await pathExists(targetDir)) {
    throw new AppError(ErrorCode.TARGET_DIRECTORY_EXISTS, `dossier déjà existant : ${targetDir}`, 409,
      { directory: targetDir });
  }

  const tmpDir = path.join(deps.tasksRoot, `.${slug}.tmp-${randomUUID()}`);
  await deps.safeFs.mkdir(tmpDir);
  await deps.safeFs.mkdir(path.join(tmpDir, 'images'));
  await deps.safeFs.mkdir(path.join(tmpDir, 'textes'));
  await deps.safeFs.mkdir(path.join(tmpDir, 'pages'));

  const nonOrphanedImages = task.images.filter((image) => !image.orphaned);
  const exportImages = await loadFromClient(deps.pool,
    (client2) => loadExportImages(client2, nonOrphanedImages.map((image) => image.cloudAssetId)));

  const skippedImages: TaskExportReport['skippedImages'][number][] = [];
  for (const selection of task.images.filter((image) => image.orphaned)) {
    skippedImages.push({ cloudAssetId: selection.cloudAssetId, reason: 'SOURCE_FILE_MISSING', expectedPath: null });
  }

  const manifestImages: ManifestInputImage[] = [];
  let imagesWritten = 0;
  let bytesWritten = 0;

  for (const selection of nonOrphanedImages) {
    const exportImage = exportImages.get(selection.cloudAssetId);
    if (exportImage === undefined) {
      skippedImages.push({ cloudAssetId: selection.cloudAssetId, reason: 'SOURCE_FILE_MISSING', expectedPath: null });
      continue;
    }

    const result = await getRender(
      deps.imageService, exportImage.sha256, { relativePath: exportImage.relativePath, format: exportImage.format },
      RENDER_EDGE,
    );
    if (result.failure !== null || result.buffer === null) {
      const failure: RenderFailure = result.failure ?? 'SOURCE_FILE_MISSING';
      skippedImages.push({
        cloudAssetId: selection.cloudAssetId, reason: failure,
        expectedPath: path.join(deps.imageService.originalsRoot, exportImage.relativePath),
      });
      continue;
    }

    await deps.safeFs.writeFile(path.join(tmpDir, 'images', `${selection.cloudAssetId}.jpg`), result.buffer);
    imagesWritten++;
    bytesWritten += result.buffer.length;

    manifestImages.push({
      cloudAssetId: exportImage.cloudAssetId, sha256: exportImage.sha256, albumPath: exportImage.albumPath,
      groupName: exportImage.groupName, date: exportImage.date, position: exportImage.position,
      people: exportImage.people, place: exportImage.place, userNote: selection.note, caption: null,
      selectedBecause: selection.selectedBecause,
    });
  }
  const exportedCloudAssetIds = manifestImages.map((image) => image.cloudAssetId);

  // Les textes orphelins (leur cible n'existe plus dans `pipeline`) sont
  // exclus en silence : le manifeste est autosuffisant, il ne référence
  // jamais rien qui n'existe plus (§7.4 point 4).
  const nonOrphanedTexts = task.texts.filter((text) => !text.orphaned);
  const attachedRefs = nonOrphanedTexts.map((text) => text.ref);

  // `note.derivedFrom.text` EST déjà l'instantané figé (public `TaskNote`,
  // V1.7) — jamais recalculé ni relu séparément ici, la même valeur nourrit
  // directement `manifest.notes[].derived_from.text` plus bas.
  const notesWithDerivation = task.notes.filter((note) => note.derivedFrom !== null);

  // `texts[]` doit porter la source de TOUTE note qui en dérive, même si
  // elle n'est pas par ailleurs attachée à la tâche (V1.7, message 1 point
  // 2 — sans quoi une référence morte). Pour une dérivation `{kind:'page'}`,
  // seuls les passages RECOUVERTS par la sélection actuelle y entrent —
  // "et eux seuls" (message 2) — jamais la page entière ; on les localise en
  // rejouant la même concaténation ordonnée que `quotable` côté SQL
  // (`locatePassagesForSelection`, cohérent par construction avec
  // `derivedSourceTextSql`). Une page/document sans doublon de requête :
  // plusieurs notes peuvent en dériver, un cache par id suffit.
  const pagePassagesCache = new Map<string, readonly ExportPagePassage[]>();
  async function passagesFor(pageOrDocumentId: string): Promise<readonly ExportPagePassage[]> {
    const cached = pagePassagesCache.get(pageOrDocumentId);
    if (cached !== undefined) return cached;
    const passages = await loadFromClient(deps.pool, (client2) => loadPagePassages(client2, pageOrDocumentId));
    pagePassagesCache.set(pageOrDocumentId, passages);
    return passages;
  }

  const derivedRefs = new Map<string, { readonly kind: string; readonly id: string }>();
  for (const note of notesWithDerivation) {
    const derivedFrom = note.derivedFrom;
    if (derivedFrom === null) continue;
    if (derivedFrom.kind === 'page') {
      const passages = await passagesFor(derivedFrom.id);
      const located = locatePassagesForSelection(note.text, passages);
      for (const ref of located.refs) derivedRefs.set(`${ref.kind}/${ref.id}`, ref);
    } else {
      derivedRefs.set(`${derivedFrom.kind}/${derivedFrom.id}`, derivedFrom);
    }
  }

  // Union dédupliquée : attachée + dérivée, une seule entrée par `kind/id`
  // même si deux notes dérivent de la même source, ou si une source dérivée
  // est PAR AILLEURS attachée (message 1 : « au plus une fois »).
  const refsByKey = new Map<string, { readonly kind: string; readonly id: string }>();
  for (const ref of attachedRefs) refsByKey.set(`${ref.kind}/${ref.id}`, ref);
  for (const [key, ref] of derivedRefs) refsByKey.set(key, ref);
  const refs = [...refsByKey.values()];

  const [exportTexts, coversByText] = await loadFromClient(deps.pool, async (client2) => [
    await loadExportTexts(client2, refs),
    await loadCoversImages(client2, refs, exportedCloudAssetIds),
  ] as const);

  const documentIds = [...new Set([...exportTexts.values()].map((t) => t.documentId))];
  const pageIds = [...new Set([...exportTexts.values()].map((t) => t.pageId).filter((id): id is string => id !== null))];
  const documents = await loadFromClient(deps.pool, (client2) => loadExportDocuments(client2, documentIds));
  const pageRelpaths = await loadFromClient(deps.pool, (client2) => loadPageImageRelpaths(client2, pageIds));

  const manifestTexts: ManifestInputText[] = [];
  const writtenPageIds = new Set<string>();
  let pagesWritten = 0;

  for (const ref of refs) {
    const key = `${ref.kind}/${ref.id}`;
    const exportText = exportTexts.get(key);
    if (exportText === undefined) continue;

    const manifestText: ManifestInputText = {
      id: exportText.id,
      kind: exportText.kind,
      document: exportText.documentId,
      page: exportText.pageId,
      text: exportText.correctedText ?? exportText.body,
      textOriginal: exportText.correctedText !== null ? exportText.body : null,
      corrected: exportText.correctedText !== null,
      date: exportText.dateSource === null || exportText.dateStart === null || exportText.dateEnd === null
        ? null
        : {
            start: exportText.dateStart, end: exportText.dateEnd, precision: 'day',
            kind: exportText.dateKind ?? 'reading', source: exportText.dateSource, bracketHours: null,
          },
      overlap: exportText.coversStart === null || exportText.coversEnd === null ? null : {
        from: exportText.coversStart, to: exportText.coversEnd,
        rule: exportText.coversRule ?? '', spanSource: exportText.pageSpanSource,
      },
      coversImages: coversByText.get(key) ?? [],
      userNote: null,
    };
    manifestTexts.push(manifestText);

    if (exportText.pageId !== null && !writtenPageIds.has(exportText.pageId)) {
      const relpath = pageRelpaths.get(exportText.pageId);
      if (relpath !== undefined) {
        const sourcePath = path.join(deps.pagesRoot, relpath);
        if (await pathExists(sourcePath)) {
          const buffer = await readFile(sourcePath);
          await deps.safeFs.writeFile(
            path.join(tmpDir, 'pages', `${exportText.pageId.replaceAll('/', '-')}.jpg`), buffer,
          );
          writtenPageIds.add(exportText.pageId);
          pagesWritten++;
        }
      }
    }
  }

  const manifestNotes: ManifestInputNote[] = task.notes.map((note) => {
    const derivedFrom = note.derivedFrom;
    const manifestDerivedFrom: ManifestNoteDerivedFrom | null = derivedFrom === null ? null : {
      kind: derivedFrom.kind, id: derivedFrom.id, text: derivedFrom.text,
    };
    return {
      id: note.id, createdAt: note.createdAt, title: note.title, text: note.text,
      attachedToImages: note.attachedTo.images, attachedToTexts: note.attachedTo.texts.map((t) => `${t.kind}/${t.id}`),
      derivedFrom: manifestDerivedFrom, editedSince: note.editedSince, quotable: note.quotable,
    };
  });

  const manifest = buildManifest({
    task: {
      slug: task.slug, title: task.title, brief: task.brief, period: task.period,
      createdAt: task.createdAt, exportedAt: new Date().toISOString(),
    },
    images: manifestImages,
    texts: manifestTexts,
    notes: manifestNotes,
  });

  await writeTextFiles(deps, tmpDir, manifestTexts, documents);
  await deps.safeFs.writeFile(path.join(tmpDir, 'textes', 'notes.md'), toMarkdown(
    'Notes', manifestNotes.map((note) => `## ${note.title}\n\n${note.text}`),
  ));
  await deps.safeFs.writeFile(path.join(tmpDir, 'README.md'), buildReadme(task, manifestImages.length, manifestTexts.length));
  await deps.safeFs.writeFile(path.join(tmpDir, 'manifest.json'), serialise(manifest));

  if (await pathExists(targetDir)) await deps.safeFs.rm(targetDir);
  await deps.safeFs.rename(tmpDir, targetDir);

  // Après le `rename`, jamais avant : le dossier existe pour de vrai avant
  // que la tâche ne prétende être exportée (contrat §7.4, invariant 7).
  await loadFromClient(deps.pool,
    (client2) => markTaskExported(client2, slug, manifest.task.exported_at, targetDir, task.contentHash));

  return {
    directory: targetDir,
    manifestPath: path.join(targetDir, 'manifest.json'),
    imagesWritten, pagesWritten, textsWritten: manifestTexts.length, notesWritten: manifestNotes.length,
    bytesWritten,
    skippedImages,
    partial: false,
    exportedAt: manifest.task.exported_at,
  };
}

async function loadFromClient<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function writeTextFiles(
  deps: ExportServiceDeps, tmpDir: string, texts: readonly ManifestInputText[],
  documents: Map<string, { readonly kind: string }>,
): Promise<void> {
  const groups: Record<'journal' | 'ma-vie' | 'site-web', string[]> = { journal: [], 'ma-vie': [], 'site-web': [] };
  for (const text of texts) {
    const documentKind = documents.get(text.document)?.kind ?? 'handwritten';
    const group = textFileFor(text, documentKind);
    const heading = text.date !== null ? `## ${text.id} — ${text.date.start}` : `## ${text.id}`;
    groups[group].push(`${heading}\n\n${text.text}`);
  }
  for (const [name, body] of Object.entries(groups) as [keyof typeof groups, string[]][]) {
    if (body.length === 0) continue;
    await deps.safeFs.writeFile(path.join(tmpDir, 'textes', `${name}.md`), toMarkdown(name, body));
  }
}

function buildReadme(
  task: { readonly title: string; readonly brief: string; readonly period: { from: string; to: string } | null },
  imageCount: number, textCount: number,
): string {
  const periodLine = task.period === null ? 'Aucune période définie.' : `Période : ${task.period.from} — ${task.period.to}`;
  return [
    `# ${task.title}`, '', task.brief, '', periodLine, '',
    `${String(imageCount)} image(s), ${String(textCount)} texte(s).`,
  ].join('\n');
}
