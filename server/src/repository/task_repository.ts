import { ulid } from 'ulid';

import { DateKind, SelectionReason, TaskState, TranscriptionConfidence } from '@shared/enums';
import type { PoolClient } from '../db/pool.ts';
import type {
  TaskCreateInput, TaskDeleteResult, TaskDetail, TaskDuplicateInput, TaskImageSelection, TaskImagesMutation,
  TaskImagesMutationResult, TaskNote, TaskNoteCreateInput, TaskNotePatchInput, TaskPatchInput, TaskReview,
  TaskReviewWarnings, TaskSummary, TaskTextRef, TaskTextSelection, TaskTextsMutation, TaskTextsMutationResult,
  TaskTimelineEntry,
} from '../contract/task_interface.ts';
import { contentHash, type TaskContent } from '../metier/tasks/content_hash.ts';
import { EFFECTIVE_COVERS_END, EFFECTIVE_COVERS_START, overlapPredicate, WEB_SPAN_JOIN } from '../metier/overlap/overlap_sql.ts';
import { listPhotos } from './photo_repository.ts';
import { listTaskTexts } from './text_repository.ts';

interface TaskRow {
  slug: string;
  title: string;
  brief: string;
  period_from: string | null;
  period_to: string | null;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  exported_at: string | null;
  export_directory: string | null;
  exported_content_hash: string | null;
}

interface ImageRow {
  cloud_asset_id: string;
  position: number;
  note: string | null;
  selected_because: readonly string[];
  selected_at: string;
  orphaned: boolean;
  out_of_period: boolean;
}

interface TextRow {
  text_kind: string;
  text_id: string;
  position: number;
  start_offset: number | null;
  end_offset: number | null;
  selected_at: string;
  orphaned: boolean;
}

interface NoteRow {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  derived_from_kind: string | null;
  derived_from_id: string | null;
  /**
   * CALCULÉ à la lecture — jamais un booléen stocké, qui pourrait mentir
   * après une écriture directe en base (contrat, amendement A4).
   */
  edited_since: boolean;
  image_ids: readonly string[];
  text_refs: readonly { kind: string; id: string }[];
}

/** Même projection partout où une ligne `TaskNote` complète est nécessaire — jamais une seconde forme qui pourrait diverger. */
const NOTE_SELECT = `
    SELECT n.id, n.title, n.body, n.created_at, n.updated_at,
           n.derived_from_kind, n.derived_from_id,
           (n.derived_text_original IS NOT NULL AND n.body <> n.derived_text_original) AS edited_since,
           coalesce(array_agg(DISTINCT ni.cloud_asset_id) FILTER (WHERE ni.cloud_asset_id IS NOT NULL), '{}')
             AS image_ids,
           coalesce(jsonb_agg(DISTINCT jsonb_build_object('kind', nt.text_kind, 'id', nt.text_id))
                      FILTER (WHERE nt.text_kind IS NOT NULL), '[]') AS text_refs
      FROM app.task_note n
      LEFT JOIN app.task_note_image ni ON ni.note_id = n.id
      LEFT JOIN app.task_note_text nt ON nt.note_id = n.id`;

async function loadImages(client: PoolClient, slug: string, row: TaskRow): Promise<readonly ImageRow[]> {
  const { rows } = await client.query<ImageRow>(`
    SELECT ti.cloud_asset_id, ti.position, ti.note, ti.selected_because, ti.selected_at,
           (p.cloud_asset_id IS NULL) AS orphaned,
           CASE
             WHEN $2::date IS NULL OR $3::date IS NULL THEN false
             WHEN p.resolved_start IS NULL OR p.resolved_end IS NULL THEN false
             WHEN NOT (daterange(p.resolved_start, p.resolved_end, '[]') && daterange($2::date, $3::date, '[]'))
               THEN true
             ELSE false
           END AS out_of_period
      FROM app.task_image ti
      LEFT JOIN pipeline.photo p ON p.cloud_asset_id = ti.cloud_asset_id
     WHERE ti.task_slug = $1
     ORDER BY ti.position`, [slug, row.period_from, row.period_to]);
  return rows;
}

async function loadTexts(client: PoolClient, slug: string): Promise<readonly TextRow[]> {
  const { rows } = await client.query<TextRow>(`
    SELECT tt.text_kind, tt.text_id, tt.position, tt.start_offset, tt.end_offset, tt.selected_at,
           (t.id IS NULL) AS orphaned
      FROM app.task_text tt
      LEFT JOIN pipeline.text_unit t ON t.kind = tt.text_kind AND t.id = tt.text_id
     WHERE tt.task_slug = $1
     ORDER BY tt.position`, [slug]);
  return rows;
}

async function loadNotes(client: PoolClient, slug: string): Promise<readonly NoteRow[]> {
  const { rows } = await client.query<NoteRow>(`
    ${NOTE_SELECT}
     WHERE n.task_slug = $1
     GROUP BY n.id
     ORDER BY n.created_at`, [slug]);
  return rows;
}

function toPeriod(row: TaskRow): TaskContent['period'] {
  return row.period_from === null || row.period_to === null ? null : { from: row.period_from, to: row.period_to };
}

function toContent(
  row: TaskRow, images: readonly ImageRow[], texts: readonly TextRow[], notes: readonly NoteRow[],
): TaskContent {
  return {
    title: row.title,
    brief: row.brief,
    period: toPeriod(row),
    images: images.map((image) => ({
      cloudAssetId: image.cloud_asset_id, order: image.position, note: image.note,
      selectedBecause: image.selected_because,
    })),
    texts: texts.map((text) => ({
      ref: { kind: text.text_kind, id: text.text_id }, order: text.position,
      startOffset: text.start_offset, endOffset: text.end_offset,
    })),
    notes: notes.map((note) => ({
      title: note.title, text: note.body,
      attachedToImages: note.image_ids, attachedToTexts: note.text_refs,
    })),
  };
}

function computeState(row: TaskRow, hash: string): TaskState {
  if (row.exported_at === null) return TaskState.DRAFT;
  return hash === row.exported_content_hash ? TaskState.EXPORTED : TaskState.EXPORTED_STALE;
}

function toSummary(
  row: TaskRow, content: TaskContent, images: readonly ImageRow[], texts: readonly TextRow[],
  notes: readonly NoteRow[],
): TaskSummary {
  const hash = contentHash(content);
  return {
    slug: row.slug,
    title: row.title,
    period: content.period,
    imageCount: images.length,
    textCount: texts.length,
    noteCount: notes.length,
    orphanCount: images.filter((i) => i.orphaned).length + texts.filter((t) => t.orphaned).length,
    state: computeState(row, hash),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    exportedAt: row.exported_at,
    exportDirectory: row.export_directory,
    contentHash: hash,
    exportedContentHash: row.exported_content_hash,
  };
}

function toImageSelection(image: ImageRow): TaskImageSelection {
  return {
    cloudAssetId: image.cloud_asset_id, order: image.position, note: image.note,
    selectedBecause: image.selected_because as TaskImageSelection['selectedBecause'],
    selectedAt: image.selected_at, orphaned: image.orphaned, outOfPeriod: image.out_of_period,
  };
}

function toTextSelection(text: TextRow): TaskTextSelection {
  return {
    ref: { kind: text.text_kind, id: text.text_id }, order: text.position, selectedAt: text.selected_at,
    orphaned: text.orphaned, startOffset: text.start_offset, endOffset: text.end_offset,
  };
}

function toTaskNote(note: NoteRow): TaskNote {
  return {
    id: note.id, title: note.title, text: note.body, createdAt: note.created_at, updatedAt: note.updated_at,
    attachedTo: { images: note.image_ids, texts: note.text_refs },
    derivedFrom: note.derived_from_kind === null || note.derived_from_id === null
      ? null : { kind: note.derived_from_kind, id: note.derived_from_id },
    editedSince: note.edited_since,
  };
}

function toDetail(
  row: TaskRow, content: TaskContent, images: readonly ImageRow[], texts: readonly TextRow[],
  notes: readonly NoteRow[],
): TaskDetail {
  const imageSelections = images.map(toImageSelection);
  const textSelections = texts.map(toTextSelection);
  const taskNotes = notes.map(toTaskNote);
  return {
    ...toSummary(row, content, images, texts, notes),
    brief: row.brief,
    images: imageSelections,
    texts: textSelections,
    notes: taskNotes,
  };
}

async function loadRow(client: PoolClient, slug: string): Promise<TaskRow | null> {
  const { rows } = await client.query<TaskRow>(`SELECT * FROM app.task WHERE slug = $1`, [slug]);
  return rows[0] ?? null;
}

/**
 * SÉQUENTIEL, jamais `Promise.all` : trois requêtes sur le MÊME `PoolClient`
 * concurremment ne pipelinent pas — `pg` les sérialise en interne et avertit
 * (dépréciation, pg 9 le refusera). Un seul client à la fois, comme partout
 * ailleurs dans ce dépôt (`withRollback` n'en ouvre qu'un).
 */
async function loadParts(
  client: PoolClient, slug: string, row: TaskRow,
): Promise<{ images: readonly ImageRow[]; texts: readonly TextRow[]; notes: readonly NoteRow[] }> {
  const images = await loadImages(client, slug, row);
  const texts = await loadTexts(client, slug);
  const notes = await loadNotes(client, slug);
  return { images, texts, notes };
}

export async function listTasks(client: PoolClient): Promise<readonly TaskSummary[]> {
  const { rows } = await client.query<TaskRow>(
    `SELECT * FROM app.task ORDER BY last_opened_at DESC NULLS LAST, created_at DESC`);
  const summaries: TaskSummary[] = [];
  for (const row of rows) {
    const { images, texts, notes } = await loadParts(client, row.slug, row);
    summaries.push(toSummary(row, toContent(row, images, texts, notes), images, texts, notes));
  }
  return summaries;
}

export async function getTaskDetail(client: PoolClient, slug: string): Promise<TaskDetail | null> {
  const row = await loadRow(client, slug);
  if (row === null) return null;
  const { images, texts, notes } = await loadParts(client, slug, row);
  return toDetail(row, toContent(row, images, texts, notes), images, texts, notes);
}

export type CreateTaskResult =
  | { readonly kind: 'created'; readonly task: TaskDetail }
  | { readonly kind: 'slug_taken'; readonly existingTitle: string };

export async function createTask(client: PoolClient, input: TaskCreateInput): Promise<CreateTaskResult> {
  const { rows: dupRows } = await client.query<{ title: string }>(
    `SELECT title FROM app.task WHERE slug = $1`, [input.slug]);
  const dup = dupRows[0];
  if (dup !== undefined) return { kind: 'slug_taken', existingTitle: dup.title };

  await client.query(
    `INSERT INTO app.task (slug, title, brief, period_from, period_to) VALUES ($1, $2, $3, $4, $5)`,
    [input.slug, input.title, input.brief, input.period?.from ?? null, input.period?.to ?? null],
  );
  const task = await getTaskDetail(client, input.slug);
  if (task === null) {
    throw new Error(`tâche introuvable juste après sa création : ${input.slug}`);
  }
  return { kind: 'created', task };
}

export async function patchTask(client: PoolClient, slug: string, patch: TaskPatchInput): Promise<TaskSummary | null> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.title !== undefined) {
    values.push(patch.title);
    sets.push(`title = $${String(values.length)}`);
  }
  if (patch.brief !== undefined) {
    values.push(patch.brief);
    sets.push(`brief = $${String(values.length)}`);
  }
  if (patch.period !== undefined) {
    values.push(patch.period?.from ?? null);
    sets.push(`period_from = $${String(values.length)}`);
    values.push(patch.period?.to ?? null);
    sets.push(`period_to = $${String(values.length)}`);
  }

  if (sets.length === 0) {
    const row = await loadRow(client, slug);
    if (row === null) return null;
    const { images, texts, notes } = await loadParts(client, slug, row);
    return toSummary(row, toContent(row, images, texts, notes), images, texts, notes);
  }

  sets.push(`updated_at = now()`);
  values.push(slug);
  const { rowCount } = await client.query(
    `UPDATE app.task SET ${sets.join(', ')} WHERE slug = $${String(values.length)}`, values);
  if (rowCount === 0) return null;

  const row = await loadRow(client, slug);
  if (row === null) return null;
  const { images, texts, notes } = await loadParts(client, slug, row);
  return toSummary(row, toContent(row, images, texts, notes), images, texts, notes);
}

interface ExistingSelection {
  cloud_asset_id: string;
  note: string | null;
  selected_because: string[];
  position: number;
}

/**
 * En UNE requête batchée, jamais une par photo (contrat §7.2 — 286 photos,
 * un seul geste) : l'existence dans `pipeline.photo` ET le chevauchement
 * `daterange &&` avec `task.period`, la même règle qu'ailleurs, jamais une
 * inégalité, jamais reconstruite en JS.
 */
async function loadPhotoInfo(
  client: PoolClient, ids: readonly string[], periodFrom: string | null, periodTo: string | null,
): Promise<Map<string, { outOfPeriod: boolean }>> {
  const info = new Map<string, { outOfPeriod: boolean }>();
  if (ids.length === 0) return info;
  const { rows } = await client.query<{ cloud_asset_id: string; out_of_period: boolean }>(`
    SELECT cloud_asset_id,
           CASE
             WHEN $2::date IS NULL OR $3::date IS NULL THEN false
             WHEN resolved_start IS NULL OR resolved_end IS NULL THEN false
             WHEN NOT (daterange(resolved_start, resolved_end, '[]') && daterange($2::date, $3::date, '[]'))
               THEN true
             ELSE false
           END AS out_of_period
      FROM pipeline.photo
     WHERE cloud_asset_id = ANY($1::char(32)[])`, [ids, periodFrom, periodTo]);
  for (const photoRow of rows) info.set(photoRow.cloud_asset_id, { outOfPeriod: photoRow.out_of_period });
  return info;
}

async function loadExistingSelections(
  client: PoolClient, slug: string, ids: readonly string[],
): Promise<Map<string, ExistingSelection>> {
  const existing = new Map<string, ExistingSelection>();
  if (ids.length === 0) return existing;
  const { rows } = await client.query<ExistingSelection>(`
    SELECT cloud_asset_id, note, selected_because, position FROM app.task_image
     WHERE task_slug = $1 AND cloud_asset_id = ANY($2::char(32)[])`, [slug, ids]);
  for (const selectionRow of rows) existing.set(selectionRow.cloud_asset_id, selectionRow);
  return existing;
}

async function nextFreePosition(client: PoolClient, slug: string): Promise<number> {
  const { rows } = await client.query<{ max_position: number | null }>(
    `SELECT max(position) AS max_position FROM app.task_image WHERE task_slug = $1`, [slug]);
  return (rows[0]?.max_position ?? -1) + 1;
}

/**
 * `add`, `remove` et `update` dans UN seul appel : sélectionner un album de
 * 286 photos est un geste, pas 286 requêtes — mais l'enregistrement fait bien
 * une ligne par photo (tâche 17). Rien n'échoue en silence : chaque entrée
 * qu'on ne peut pas appliquer est nommée dans `rejected`, chaque réserve dans
 * `warnings` — un avertissement n'est jamais un rejet.
 */
export async function mutateTaskImages(
  client: PoolClient, slug: string, mutation: TaskImagesMutation,
): Promise<TaskImagesMutationResult | null> {
  const row = await loadRow(client, slug);
  if (row === null) return null;

  const allIds = new Set<string>();
  for (const item of mutation.add ?? []) allIds.add(item.cloudAssetId);
  for (const id of mutation.remove ?? []) allIds.add(id);
  for (const item of mutation.update ?? []) allIds.add(item.cloudAssetId);
  const idList = [...allIds];

  const photoInfo = await loadPhotoInfo(client, idList, row.period_from, row.period_to);
  const existing = await loadExistingSelections(client, slug, idList);
  let nextPosition = await nextFreePosition(client, slug);

  let added = 0;
  let merged = 0;
  let removed = 0;
  let updated = 0;
  const implicitlyAdded: string[] = [];
  const rejected: TaskImagesMutationResult['rejected'][number][] = [];
  const warnings: TaskImagesMutationResult['warnings'][number][] = [];

  for (const item of mutation.add ?? []) {
    const info = photoInfo.get(item.cloudAssetId);
    if (info === undefined) {
      rejected.push({ cloudAssetId: item.cloudAssetId, reason: 'unknown_photo' });
      continue;
    }
    const current = existing.get(item.cloudAssetId);
    if (current !== undefined) {
      const mergedBecause = [...new Set([...current.selected_because, ...item.selectedBecause])];
      await client.query(
        `UPDATE app.task_image SET selected_because = $3 WHERE task_slug = $1 AND cloud_asset_id = $2`,
        [slug, item.cloudAssetId, mergedBecause],
      );
      current.selected_because = mergedBecause;
      merged++;
    } else {
      const dedupedBecause = [...new Set(item.selectedBecause)];
      await client.query(
        `INSERT INTO app.task_image (task_slug, cloud_asset_id, position, note, selected_because)
         VALUES ($1, $2, $3, $4, $5)`,
        [slug, item.cloudAssetId, nextPosition, item.note ?? null, dedupedBecause],
      );
      existing.set(item.cloudAssetId, {
        cloud_asset_id: item.cloudAssetId, note: item.note ?? null,
        selected_because: dedupedBecause, position: nextPosition,
      });
      nextPosition++;
      added++;
      if (info.outOfPeriod) warnings.push({ cloudAssetId: item.cloudAssetId, code: 'out_of_period' });
    }
  }

  for (const cloudAssetId of mutation.remove ?? []) {
    if (!existing.has(cloudAssetId)) {
      rejected.push({ cloudAssetId, reason: 'not_selected' });
      continue;
    }
    await client.query(`DELETE FROM app.task_image WHERE task_slug = $1 AND cloud_asset_id = $2`,
      [slug, cloudAssetId]);
    existing.delete(cloudAssetId);
    removed++;
  }

  for (const item of mutation.update ?? []) {
    const current = existing.get(item.cloudAssetId);
    if (current === undefined) {
      // Écrire une note SÉLECTIONNE implicitement — c'est le geste. Sans
      // note, il n'y a rien qui justifie une sélection : rejeté, nommé.
      if (item.note === undefined) {
        rejected.push({ cloudAssetId: item.cloudAssetId, reason: 'not_selected' });
        continue;
      }
      const info = photoInfo.get(item.cloudAssetId);
      if (info === undefined) {
        rejected.push({ cloudAssetId: item.cloudAssetId, reason: 'unknown_photo' });
        continue;
      }
      const impliedBecause = [SelectionReason.MANUAL];
      await client.query(
        `INSERT INTO app.task_image (task_slug, cloud_asset_id, position, note, selected_because)
         VALUES ($1, $2, $3, $4, $5)`,
        [slug, item.cloudAssetId, nextPosition, item.note, impliedBecause],
      );
      existing.set(item.cloudAssetId, {
        cloud_asset_id: item.cloudAssetId, note: item.note, selected_because: impliedBecause, position: nextPosition,
      });
      nextPosition++;
      implicitlyAdded.push(item.cloudAssetId);
      updated++;
      if (info.outOfPeriod) warnings.push({ cloudAssetId: item.cloudAssetId, code: 'out_of_period' });
      continue;
    }

    const sets: string[] = [];
    const values: unknown[] = [slug, item.cloudAssetId];
    if (item.note !== undefined) {
      values.push(item.note);
      sets.push(`note = $${String(values.length)}`);
    }
    if (item.order !== undefined) {
      values.push(item.order);
      sets.push(`position = $${String(values.length)}`);
    }
    if (sets.length > 0) {
      await client.query(`UPDATE app.task_image SET ${sets.join(', ')} WHERE task_slug = $1 AND cloud_asset_id = $2`,
        values);
    }
    updated++;
    if (photoInfo.get(item.cloudAssetId) === undefined) {
      warnings.push({ cloudAssetId: item.cloudAssetId, code: 'orphaned' });
    }
  }

  const finalRow = await loadRow(client, slug);
  if (finalRow === null) {
    throw new Error(`tâche disparue pendant sa propre mutation : ${slug}`);
  }
  const { images, texts, notes } = await loadParts(client, slug, finalRow);
  const summary = toSummary(finalRow, toContent(finalRow, images, texts, notes), images, texts, notes);

  return {
    added, merged, removed, updated, implicitlyAdded, rejected, warnings,
    imageCount: summary.imageCount, contentHash: summary.contentHash, state: summary.state,
  };
}

const SUPPORTED_TEXT_KINDS = new Set(['passage', 'log_entry']);

async function loadExistingTextExistence(
  client: PoolClient, refs: readonly TaskTextRef[],
): Promise<Set<string>> {
  const existing = new Set<string>();
  const byKind = new Map<string, string[]>();
  for (const ref of refs) {
    if (!SUPPORTED_TEXT_KINDS.has(ref.kind)) continue;
    const ids = byKind.get(ref.kind) ?? [];
    ids.push(ref.id);
    byKind.set(ref.kind, ids);
  }
  for (const [kind, ids] of byKind) {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM pipeline.text_unit WHERE kind = $1 AND id = ANY($2)`, [kind, ids]);
    for (const row of rows) existing.add(`${kind}/${row.id}`);
  }
  return existing;
}

/**
 * `add`/`remove`/`reorder` par `TextRef`, jamais un `id` seul (tâche 22) —
 * même clé composite que partout ailleurs, `(kind, id)`.
 */
export async function mutateTaskTexts(
  client: PoolClient, slug: string, mutation: TaskTextsMutation,
): Promise<TaskTextsMutationResult | null> {
  const row = await loadRow(client, slug);
  if (row === null) return null;

  const addRefs = mutation.add ?? [];
  const existing = await loadExistingTextExistence(client, addRefs);

  const { rows: maxRows } = await client.query<{ max_position: number | null }>(
    `SELECT max(position) AS max_position FROM app.task_text WHERE task_slug = $1`, [slug]);
  let nextPosition = (maxRows[0]?.max_position ?? -1) + 1;

  let added = 0;
  let removed = 0;
  const rejected: TaskTextsMutationResult['rejected'][number][] = [];

  for (const ref of addRefs) {
    if (!existing.has(`${ref.kind}/${ref.id}`)) {
      rejected.push({ ref, reason: 'unknown_text' });
      continue;
    }
    const { rowCount } = await client.query(
      `INSERT INTO app.task_text (task_slug, text_kind, text_id, position)
       VALUES ($1, $2, $3, $4) ON CONFLICT (task_slug, text_kind, text_id) DO NOTHING`,
      [slug, ref.kind, ref.id, nextPosition],
    );
    if (rowCount !== null && rowCount > 0) {
      added++;
      nextPosition++;
    }
  }

  for (const ref of mutation.remove ?? []) {
    const { rowCount } = await client.query(
      `DELETE FROM app.task_text WHERE task_slug = $1 AND text_kind = $2 AND text_id = $3`,
      [slug, ref.kind, ref.id],
    );
    if (rowCount !== null && rowCount > 0) removed++;
    else rejected.push({ ref, reason: 'not_selected' });
  }

  for (const item of mutation.reorder ?? []) {
    const { rowCount } = await client.query(
      `UPDATE app.task_text SET position = $4 WHERE task_slug = $1 AND text_kind = $2 AND text_id = $3`,
      [slug, item.ref.kind, item.ref.id, item.order],
    );
    if (rowCount === null || rowCount === 0) rejected.push({ ref: item.ref, reason: 'not_selected' });
  }

  const finalRow = await loadRow(client, slug);
  if (finalRow === null) {
    throw new Error(`tâche disparue pendant sa propre mutation : ${slug}`);
  }
  const { images, texts, notes } = await loadParts(client, slug, finalRow);
  const summary = toSummary(finalRow, toContent(finalRow, images, texts, notes), images, texts, notes);

  return { added, removed, rejected, textCount: summary.textCount, contentHash: summary.contentHash };
}

export async function createTaskNote(
  client: PoolClient, slug: string, input: TaskNoteCreateInput,
): Promise<TaskNote | null> {
  const row = await loadRow(client, slug);
  if (row === null) return null;

  const id = `note_${ulid()}`;
  // `derived_text_original` porte le texte EFFECTIF (corrigé s'il l'a été) au
  // moment de la recopie — jamais recalculé plus tard, sinon une correction
  // ultérieure du texte source ferait bouger `editedSince` sans qu'aucune
  // écriture n'ait touché la note elle-même.
  await client.query(
    `INSERT INTO app.task_note (id, task_slug, title, body, derived_from_kind, derived_from_id, derived_text_original)
     SELECT $1, $2, $3, $4, $5::text, $6::text,
            (SELECT coalesce(c.corrected_text, t.body) FROM pipeline.text_unit t
               LEFT JOIN app.text_correction c ON c.text_kind = t.kind AND c.text_id = t.id
              WHERE t.kind = $5 AND t.id = $6)`,
    [id, slug, input.title, input.text, input.derivedFrom?.kind ?? null, input.derivedFrom?.id ?? null],
  );
  for (const cloudAssetId of input.attachedTo.images) {
    await client.query(
      `INSERT INTO app.task_note_image (note_id, cloud_asset_id) VALUES ($1, $2)`, [id, cloudAssetId]);
  }
  for (const ref of input.attachedTo.texts) {
    await client.query(
      `INSERT INTO app.task_note_text (note_id, text_kind, text_id) VALUES ($1, $2, $3)`,
      [id, ref.kind, ref.id],
    );
  }
  return await loadNoteById(client, id);
}

async function loadNoteById(client: PoolClient, noteId: string): Promise<TaskNote | null> {
  const { rows } = await client.query<NoteRow>(`${NOTE_SELECT} WHERE n.id = $1 GROUP BY n.id`, [noteId]);
  const row = rows[0];
  return row === undefined ? null : toTaskNote(row);
}

export async function patchTaskNote(
  client: PoolClient, slug: string, noteId: string, patch: TaskNotePatchInput,
): Promise<TaskNote | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.title !== undefined) {
    values.push(patch.title);
    sets.push(`title = $${String(values.length)}`);
  }
  if (patch.text !== undefined) {
    values.push(patch.text);
    sets.push(`body = $${String(values.length)}`);
  }
  if (sets.length > 0) {
    sets.push(`updated_at = now()`);
    values.push(slug, noteId);
    const { rowCount } = await client.query(
      `UPDATE app.task_note SET ${sets.join(', ')}
        WHERE task_slug = $${String(values.length - 1)} AND id = $${String(values.length)}`, values);
    if (rowCount === 0) return null;
  }
  if (patch.attachedTo !== undefined) {
    await client.query(`DELETE FROM app.task_note_image WHERE note_id = $1`, [noteId]);
    await client.query(`DELETE FROM app.task_note_text WHERE note_id = $1`, [noteId]);
    for (const cloudAssetId of patch.attachedTo.images) {
      await client.query(
        `INSERT INTO app.task_note_image (note_id, cloud_asset_id) VALUES ($1, $2)`, [noteId, cloudAssetId]);
    }
    for (const ref of patch.attachedTo.texts) {
      await client.query(
        `INSERT INTO app.task_note_text (note_id, text_kind, text_id) VALUES ($1, $2, $3)`,
        [noteId, ref.kind, ref.id],
      );
    }
  }
  return await loadNoteById(client, noteId);
}

/**
 * Supprimer une note ne touche JAMAIS aux images/textes rattachés — seule la
 * note et ses lignes de rattachement (`ON DELETE CASCADE`) disparaissent.
 */
/**
 * Le dernier geste d'un export réussi (contrat §7.4) — après le `rename`
 * atomique, jamais avant : marquer la tâche pour un dossier qui n'existe pas
 * encore serait pire que ne pas la marquer. `exportedContentHash` est le
 * `contentHash` DÉJÀ calculé par `getTaskDetail` en tête d'`exportTask`, sur
 * l'instantané exact qui a été écrit — jamais recalculé ici, où une mutation
 * concurrente aurait pu changer la sélection depuis.
 */
export async function markTaskExported(
  client: PoolClient, slug: string, exportedAt: string, exportDirectory: string, exportedContentHash: string,
): Promise<void> {
  await client.query(
    `UPDATE app.task SET exported_at = $2, export_directory = $3, exported_content_hash = $4 WHERE slug = $1`,
    [slug, exportedAt, exportDirectory, exportedContentHash],
  );
}

export async function deleteTaskNote(client: PoolClient, slug: string, noteId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `DELETE FROM app.task_note WHERE task_slug = $1 AND id = $2`, [slug, noteId]);
  return rowCount !== null && rowCount > 0;
}

/**
 * GLOBAL, toutes tâches confondues — `SystemStatus.attention.orphanedSelections`
 * (contrat §9). Même paire de jointures que `loadImages`/`loadTexts`
 * (`p.cloud_asset_id IS NULL` / `t.id IS NULL`), agrégée plutôt que par tâche.
 */
export async function countOrphanedSelections(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ n: number }>(`
    SELECT
      (SELECT count(*)::int FROM app.task_image ti
         LEFT JOIN pipeline.photo p ON p.cloud_asset_id = ti.cloud_asset_id
        WHERE p.cloud_asset_id IS NULL)
      +
      (SELECT count(*)::int FROM app.task_text tt
         LEFT JOIN pipeline.text_unit t ON t.kind = tt.text_kind AND t.id = tt.text_id
        WHERE t.id IS NULL) AS n`);
  return rows[0]?.n ?? 0;
}

/**
 * Une photo sélectionnée dans la tâche qu'AUCUN texte ne recouvre — LE
 * prédicat de recouvrement (`overlap_sql.ts`), une seule fois, jamais
 * redéfini ici (contrat §4.1, §7.3). Une photo orpheline n'a pas de ligne
 * `pipeline.photo` : la jointure l'exclut, elle compte ailleurs.
 */
async function countImagesWithoutText(client: PoolClient, slug: string): Promise<number> {
  const { rows } = await client.query<{ n: number }>(`
    SELECT count(*)::int AS n
      FROM app.task_image ti
      JOIN pipeline.photo p ON p.cloud_asset_id = ti.cloud_asset_id
     WHERE ti.task_slug = $1
       AND NOT EXISTS (
         SELECT 1 FROM pipeline.text_unit t
         ${WEB_SPAN_JOIN}
         WHERE ${overlapPredicate('p')})`, [slug]);
  return rows[0]?.n ?? 0;
}

/**
 * Un texte dont la fenêtre de recouvrement EFFECTIVE (`covers_*`, comblée en
 * direct par `ref.web_span` — même règle que §21) dépasse 30 jours : associer
 * une photo à ce texte par recouvrement ne vaut alors plus grand-chose. Ce
 * n'est PAS `TextUnit.date` — un texte affirme un jour ou rien (D11, `date_start
 * = date_end` est une contrainte du schéma) — c'est la fenêtre CALCULÉE
 * autour de lui, qu'aucun champ public de `TextUnit` n'expose : encore une
 * raison pour laquelle ce compteur ne peut pas se dériver côté client.
 */
async function countTextsWiderThan30Days(client: PoolClient, slug: string): Promise<number> {
  const { rows } = await client.query<{ n: number }>(`
    SELECT count(*)::int AS n
      FROM app.task_text tt
      JOIN pipeline.text_unit t ON t.kind = tt.text_kind AND t.id = tt.text_id
      ${WEB_SPAN_JOIN}
     WHERE tt.task_slug = $1
       AND ${EFFECTIVE_COVERS_START} IS NOT NULL AND ${EFFECTIVE_COVERS_END} IS NOT NULL
       AND (${EFFECTIVE_COVERS_END} - ${EFFECTIVE_COVERS_START}) > 30`, [slug]);
  return rows[0]?.n ?? 0;
}

/**
 * `GET /tasks/:slug/review` (tâche 26, contrat §7.3). Les huit compteurs se
 * calculent ici, jamais côté client — même raison que le prédicat de
 * recouvrement : une seconde implémentation qui peut diverger de la
 * première est pire qu'un endpoint de plus.
 */
export async function getTaskReview(client: PoolClient, slug: string): Promise<TaskReview | null> {
  const row = await loadRow(client, slug);
  if (row === null) return null;
  const { images, texts, notes } = await loadParts(client, slug, row);
  const task = toSummary(row, toContent(row, images, texts, notes), images, texts, notes);

  const imageSelectionByCloudAssetId = new Map(images.map((image) => [image.cloud_asset_id, toImageSelection(image)]));
  const { items: photos } = await listPhotos(client, { inTask: [slug], scope: 'all' });
  const reviewImages = photos.map((photo) => {
    const selection = imageSelectionByCloudAssetId.get(photo.cloudAssetId);
    if (selection === undefined) throw new Error(`photo hors sélection renvoyée par inTask : ${photo.cloudAssetId}`);
    return { ...photo, selection };
  });

  const textSelectionByRef = new Map(texts.map((text) => [`${text.text_kind}/${text.text_id}`, toTextSelection(text)]));
  const taskTexts = await listTaskTexts(client, slug);
  const reviewTexts = taskTexts.map((unit) => {
    const selection = textSelectionByRef.get(`${unit.ref.kind}/${unit.ref.id}`);
    if (selection === undefined) throw new Error(`texte hors sélection renvoyé par listTaskTexts : ${unit.ref.kind}/${unit.ref.id}`);
    return { ...unit, selection };
  });

  const warnings: TaskReviewWarnings = {
    undatedImages: reviewImages.filter((image) => image.date === null).length,
    inferredDateImages: reviewImages.filter((image) => image.date?.kind === DateKind.INFERENCE).length,
    uncertainTexts: reviewTexts.filter((text) => text.confidence === TranscriptionConfidence.UNCERTAIN).length,
    textsWiderThan30Days: await countTextsWiderThan30Days(client, slug),
    imagesWithoutText: await countImagesWithoutText(client, slug),
    orphanedImages: images.filter((image) => image.orphaned).length,
    orphanedTexts: texts.filter((text) => text.orphaned).length,
    imagesOutOfPeriod: images.filter((image) => image.out_of_period).length,
  };

  const timeline: TaskTimelineEntry[] = [];
  for (const image of reviewImages) {
    if (image.date === null) continue;
    timeline.push({
      kind: 'image', id: image.cloudAssetId,
      start: image.date.start, end: image.date.end, precision: image.date.precision, dateKind: image.date.kind,
    });
  }
  for (const text of reviewTexts) {
    if (text.date === null) continue;
    timeline.push({
      kind: 'text', id: `${text.ref.kind}/${text.ref.id}`,
      start: text.date.start, end: text.date.end, precision: text.date.precision, dateKind: text.date.kind,
    });
  }
  timeline.sort((a, b) => a.start.localeCompare(b.start));

  return { task, images: reviewImages, texts: reviewTexts, notes: notes.map(toTaskNote), warnings, timeline };
}

/** `null` : la tâche n'existe pas. Le dossier déjà exporté n'est JAMAIS touché — nommé dans la réponse. */
export async function deleteTask(client: PoolClient, slug: string): Promise<TaskDeleteResult | null> {
  const { rows } = await client.query<{ export_directory: string | null }>(
    `DELETE FROM app.task WHERE slug = $1 RETURNING export_directory`, [slug]);
  const row = rows[0];
  return row === undefined ? null : { deleted: true, exportDirectoryKept: row.export_directory };
}

export type DuplicateTaskResult =
  | { readonly kind: 'created'; readonly task: TaskDetail }
  | { readonly kind: 'slug_taken'; readonly existingTitle: string }
  | { readonly kind: 'source_not_found' };

/**
 * Copie la sélection (images, textes, notes) et le `brief`/`period` — jamais
 * l'état d'export : la copie naît `draft`, `exportedAt`/`exportDirectory`
 * restent `null` (contrat §7.5 — c'est le point de la duplication, revoir un
 * dossier déjà livré sans y toucher).
 */
export async function duplicateTask(
  client: PoolClient, sourceSlug: string, input: TaskDuplicateInput,
): Promise<DuplicateTaskResult> {
  const sourceRow = await loadRow(client, sourceSlug);
  if (sourceRow === null) return { kind: 'source_not_found' };

  const { rows: dupRows } = await client.query<{ title: string }>(
    `SELECT title FROM app.task WHERE slug = $1`, [input.slug]);
  const dup = dupRows[0];
  if (dup !== undefined) return { kind: 'slug_taken', existingTitle: dup.title };

  await client.query(
    `INSERT INTO app.task (slug, title, brief, period_from, period_to)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.slug, input.title, sourceRow.brief, sourceRow.period_from, sourceRow.period_to],
  );
  await client.query(
    `INSERT INTO app.task_image (task_slug, cloud_asset_id, position, note, selected_because)
       SELECT $1, cloud_asset_id, position, note, selected_because
         FROM app.task_image WHERE task_slug = $2`,
    [input.slug, sourceSlug],
  );
  await client.query(
    `INSERT INTO app.task_text (task_slug, text_kind, text_id, position, start_offset, end_offset)
       SELECT $1, text_kind, text_id, position, start_offset, end_offset
         FROM app.task_text WHERE task_slug = $2`,
    [input.slug, sourceSlug],
  );

  // Notes rejouées une à une : chaque copie a besoin d'un ULID neuf, un
  // `INSERT ... SELECT` ne peut pas en générer un par ligne recopiée. La
  // provenance (`derived_*`) suit la copie — une citation reste une
  // citation après duplication, `editedSince` se recalcule de lui-même
  // puisqu'il n'est jamais qu'une comparaison à la lecture.
  const { rows: sourceNotes } = await client.query<{
    id: string; title: string; body: string;
    derived_from_kind: string | null; derived_from_id: string | null; derived_text_original: string | null;
  }>(
    `SELECT id, title, body, derived_from_kind, derived_from_id, derived_text_original
       FROM app.task_note WHERE task_slug = $1 ORDER BY created_at`, [sourceSlug]);
  for (const note of sourceNotes) {
    const newId = `note_${ulid()}`;
    await client.query(
      `INSERT INTO app.task_note (id, task_slug, title, body, derived_from_kind, derived_from_id, derived_text_original)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [newId, input.slug, note.title, note.body, note.derived_from_kind, note.derived_from_id, note.derived_text_original],
    );
    await client.query(
      `INSERT INTO app.task_note_image (note_id, cloud_asset_id)
         SELECT $1, cloud_asset_id FROM app.task_note_image WHERE note_id = $2`,
      [newId, note.id],
    );
    await client.query(
      `INSERT INTO app.task_note_text (note_id, text_kind, text_id)
         SELECT $1, text_kind, text_id FROM app.task_note_text WHERE note_id = $2`,
      [newId, note.id],
    );
  }

  const detail = await getTaskDetail(client, input.slug);
  if (detail === null) throw new Error(`tâche disparue pendant sa propre duplication : ${input.slug}`);
  return { kind: 'created', task: detail };
}
