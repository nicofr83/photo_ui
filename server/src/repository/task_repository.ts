import { TaskState } from '@shared/enums';
import type { PoolClient } from '../db/pool.ts';
import type {
  TaskCreateInput, TaskDetail, TaskImageSelection, TaskNote, TaskPatchInput, TaskSummary, TaskTextSelection,
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
