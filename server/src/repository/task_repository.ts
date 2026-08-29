import { ulid } from 'ulid';

import { SelectionReason, TaskState } from '@shared/enums';
import type { PoolClient } from '../db/pool.ts';
import type {
  TaskCreateInput, TaskDetail, TaskImageSelection, TaskImagesMutation, TaskImagesMutationResult, TaskNote,
  TaskNoteCreateInput, TaskNotePatchInput, TaskPatchInput, TaskSummary, TaskTextRef, TaskTextSelection,
  TaskTextsMutation, TaskTextsMutationResult,
} from '../contract/task_interface.ts';
import { contentHash, type TaskContent } from '../metier/tasks/content_hash.ts';

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
  image_ids: readonly string[];
  text_refs: readonly { kind: string; id: string }[];
}

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
    SELECT n.id, n.title, n.body, n.created_at, n.updated_at,
           coalesce(array_agg(DISTINCT ni.cloud_asset_id) FILTER (WHERE ni.cloud_asset_id IS NOT NULL), '{}')
             AS image_ids,
           coalesce(jsonb_agg(DISTINCT jsonb_build_object('kind', nt.text_kind, 'id', nt.text_id))
                      FILTER (WHERE nt.text_kind IS NOT NULL), '[]') AS text_refs
      FROM app.task_note n
      LEFT JOIN app.task_note_image ni ON ni.note_id = n.id
      LEFT JOIN app.task_note_text nt ON nt.note_id = n.id
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

function toDetail(
  row: TaskRow, content: TaskContent, images: readonly ImageRow[], texts: readonly TextRow[],
  notes: readonly NoteRow[],
): TaskDetail {
  const imageSelections: TaskImageSelection[] = images.map((image) => ({
    cloudAssetId: image.cloud_asset_id, order: image.position, note: image.note,
    selectedBecause: image.selected_because as TaskImageSelection['selectedBecause'],
    selectedAt: image.selected_at, orphaned: image.orphaned, outOfPeriod: image.out_of_period,
  }));
  const textSelections: TaskTextSelection[] = texts.map((text) => ({
    ref: { kind: text.text_kind, id: text.text_id }, order: text.position, selectedAt: text.selected_at,
    orphaned: text.orphaned, startOffset: text.start_offset, endOffset: text.end_offset,
  }));
  const taskNotes: TaskNote[] = notes.map((note) => ({
    id: note.id, title: note.title, text: note.body, createdAt: note.created_at, updatedAt: note.updated_at,
    attachedTo: { images: note.image_ids, texts: note.text_refs },
  }));
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
  await client.query(
    `INSERT INTO app.task_note (id, task_slug, title, body) VALUES ($1, $2, $3, $4)`,
    [id, slug, input.title, input.text],
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
  const { rows } = await client.query<NoteRow>(`
    SELECT n.id, n.title, n.body, n.created_at, n.updated_at,
           coalesce(array_agg(DISTINCT ni.cloud_asset_id) FILTER (WHERE ni.cloud_asset_id IS NOT NULL), '{}')
             AS image_ids,
           coalesce(jsonb_agg(DISTINCT jsonb_build_object('kind', nt.text_kind, 'id', nt.text_id))
                      FILTER (WHERE nt.text_kind IS NOT NULL), '[]') AS text_refs
      FROM app.task_note n
      LEFT JOIN app.task_note_image ni ON ni.note_id = n.id
      LEFT JOIN app.task_note_text nt ON nt.note_id = n.id
     WHERE n.id = $1
     GROUP BY n.id`, [noteId]);
  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: row.id, title: row.title, text: row.body, createdAt: row.created_at, updatedAt: row.updated_at,
    attachedTo: { images: row.image_ids, texts: row.text_refs },
  };
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
export async function deleteTaskNote(client: PoolClient, slug: string, noteId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `DELETE FROM app.task_note WHERE task_slug = $1 AND id = $2`, [slug, noteId]);
  return rowCount !== null && rowCount > 0;
}
