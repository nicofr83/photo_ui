import path from 'node:path';

import type { FastifyInstance } from 'fastify';

import { ErrorCode } from '@shared/enums';
import { AppError } from '../contract/error_interface.ts';
import type {
  TaskCreateInput, TaskDeleteResult, TaskDetail, TaskDuplicateInput, TaskExportInput, TaskImagesMutation,
  TaskImagesMutationResult, TaskNote, TaskNoteCreateInput, TaskNotePatchInput, TaskPatchInput, TaskPeriod,
  TaskReview, TaskSummary, TaskTextRef, TaskTextsMutation, TaskTextsMutationResult,
} from '../contract/task_interface.ts';
import type { Pool } from '../db/pool.ts';
import { withTransaction } from '../db/transaction.ts';
import type { ExportServiceDeps } from '../metier/export/export_service.ts';
import { exportTask } from '../metier/export/export_service.ts';
import type { Job, JobStore } from '../metier/jobs/job_service.ts';
import { attributionPrefix, titleKeepsPrefix } from '../metier/tasks/note_title.ts';
import {
  createTask, createTaskNote, deleteTask, deleteTaskNote, duplicateTask, getTaskDetail, getTaskReview, listTasks,
  loadNoteById, mutateTaskImages, mutateTaskTexts, patchTask, patchTaskNote,
} from '../repository/task_repository.ts';

/** Même expression que `app.task.task_slug_is_a_folder_name` — un refus nommé plutôt qu'une contrainte Postgres brute. */
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function invalidParameter(parameter: string, received: string, message: string): AppError {
  return new AppError(ErrorCode.INVALID_PARAMETER, message, 400, { parameter, received, accepted: null });
}

function assertValidSlug(slug: string): void {
  if (!SLUG.test(slug)) {
    throw invalidParameter('slug', slug, `slug invalide, doit correspondre à ${SLUG.source} : ${slug}`);
  }
}

function assertOrderedPeriod(period: TaskPeriod | null | undefined): void {
  if (period != null && period.from > period.to) {
    throw invalidParameter('period', `${period.from}..${period.to}`, 'la période doit avoir from <= to');
  }
}

/**
 * Confiné sous `TASKS_ROOT` (contrat A8, spec v1.5) — c'est la liste blanche
 * d'écriture du serveur. `startsWith` seul accepterait `<root>-autre` ; le
 * séparateur ferme la faille. Refusé, jamais assaini en silence : une racine
 * créée sur une faute de frappe donne un dossier fantôme qu'on ne retrouve
 * jamais.
 */
function resolveExportDirectory(raw: string, tasksRoot: string): string {
  const resolved = path.resolve(tasksRoot, raw);
  const root = path.resolve(tasksRoot);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new AppError(ErrorCode.DIRECTORY_OUTSIDE_ROOT,
      'le répertoire de livraison doit rester sous TASKS_ROOT', 422, { directory: raw, root });
  }
  return resolved;
}

/** Le défaut `<TASKS_ROOT>/<slug>` (contrat A8) — appliqué à la frontière HTTP, jamais dans le dépôt : `export_directory` reste `NULL` en base tant que rien n'a été réglé. */
function resolveTaskExportDirectory<T extends { readonly slug: string; readonly exportDirectory: string | null }>(
  task: T, tasksRoot: string,
): T {
  return task.exportDirectory === null ? { ...task, exportDirectory: path.join(tasksRoot, task.slug) } : task;
}

function isPeriod(value: unknown): value is TaskPeriod {
  return typeof value === 'object' && value !== null
    && typeof (value as { from?: unknown }).from === 'string'
    && typeof (value as { to?: unknown }).to === 'string';
}

/**
 * Le corps d'une requête Fastify est `unknown` par défaut (pas de schéma
 * attaché) : une frontière de validation EXPLICITE, comme l'allowlist des
 * paramètres de requête ailleurs — jamais un cast aveugle sur de l'entrée
 * non fiable.
 */
function parseCreateInput(body: unknown): TaskCreateInput {
  if (typeof body !== 'object' || body === null) {
    throw invalidParameter('body', JSON.stringify(body), 'corps de requête invalide');
  }
  const { title, slug, brief, period } = body as Record<string, unknown>;
  if (typeof title !== 'string') throw invalidParameter('title', JSON.stringify(title), 'title doit être une chaîne');
  if (typeof slug !== 'string') throw invalidParameter('slug', JSON.stringify(slug), 'slug doit être une chaîne');
  if (typeof brief !== 'string') throw invalidParameter('brief', JSON.stringify(brief), 'brief doit être une chaîne');
  if (period !== null && period !== undefined && !isPeriod(period)) {
    throw invalidParameter('period', JSON.stringify(period), 'period doit être { from, to } ou null');
  }
  return { title, slug, brief, period: period === undefined ? null : period };
}

function parsePatchInput(body: unknown, tasksRoot: string): TaskPatchInput {
  if (typeof body !== 'object' || body === null) {
    throw invalidParameter('body', JSON.stringify(body), 'corps de requête invalide');
  }
  const { title, brief, period, exportDirectory } = body as Record<string, unknown>;
  const patch: TaskPatchInput = {};
  if (title !== undefined) {
    if (typeof title !== 'string') throw invalidParameter('title', JSON.stringify(title), 'title doit être une chaîne');
    Object.assign(patch, { title });
  }
  if (brief !== undefined) {
    if (typeof brief !== 'string') throw invalidParameter('brief', JSON.stringify(brief), 'brief doit être une chaîne');
    Object.assign(patch, { brief });
  }
  if (period !== undefined) {
    if (period !== null && !isPeriod(period)) {
      throw invalidParameter('period', JSON.stringify(period), 'period doit être { from, to } ou null');
    }
    Object.assign(patch, { period });
  }
  if (exportDirectory !== undefined) {
    if (exportDirectory !== null && typeof exportDirectory !== 'string') {
      throw invalidParameter('exportDirectory', JSON.stringify(exportDirectory), 'exportDirectory doit être une chaîne ou null');
    }
    // `null` remet au défaut (`export_directory` redevient NULL en base) —
    // jamais assaini, la résolution ne s'applique qu'à une valeur fournie.
    Object.assign(patch, { exportDirectory: exportDirectory === null ? null : resolveExportDirectory(exportDirectory, tasksRoot) });
  }
  return patch;
}

type TaskImageAddItem = NonNullable<TaskImagesMutation['add']>[number];
type TaskImageUpdateItem = NonNullable<TaskImagesMutation['update']>[number];

/**
 * Un `cloudAssetId` manquant ne doit JAMAIS ressembler à un refus métier
 * (« photo inconnue ») — un élément mal formé est un défaut du CLIENT, pas de
 * la donnée : un `add: [cloudAssetId, ...]` (chaîne nue, sans son enveloppe
 * `{ cloudAssetId, selectedBecause }`) traverserait sinon toute la chaîne en
 * silence — `item.cloudAssetId` vaut `undefined` en JS, jamais une erreur —
 * jusqu'à un `rejected: [{ reason: 'unknown_photo' }]` qui ment sur la vraie
 * cause, `cloudAssetId` disparu de la sérialisation JSON avec lui.
 */
function parseImageAddItem(value: unknown, index: number): TaskImageAddItem {
  if (typeof value !== 'object' || value === null) {
    throw invalidParameter(`add[${String(index)}]`, JSON.stringify(value),
      'chaque élément de add doit être { cloudAssetId, selectedBecause }, jamais un identifiant nu');
  }
  const { cloudAssetId, selectedBecause, note } = value as Record<string, unknown>;
  if (typeof cloudAssetId !== 'string') {
    throw invalidParameter(`add[${String(index)}].cloudAssetId`, JSON.stringify(cloudAssetId),
      'cloudAssetId doit être une chaîne');
  }
  if (!Array.isArray(selectedBecause) || !selectedBecause.every((v) => typeof v === 'string')) {
    throw invalidParameter(`add[${String(index)}].selectedBecause`, JSON.stringify(selectedBecause),
      'selectedBecause doit être un tableau de chaînes');
  }
  const item: { cloudAssetId: string; selectedBecause: TaskImageAddItem['selectedBecause']; note?: string } =
    { cloudAssetId, selectedBecause: selectedBecause as TaskImageAddItem['selectedBecause'] };
  if (note !== undefined) {
    if (typeof note !== 'string') {
      throw invalidParameter(`add[${String(index)}].note`, JSON.stringify(note), 'note doit être une chaîne');
    }
    Object.assign(item, { note });
  }
  return item;
}

function parseImageUpdateItem(value: unknown, index: number): TaskImageUpdateItem {
  if (typeof value !== 'object' || value === null) {
    throw invalidParameter(`update[${String(index)}]`, JSON.stringify(value),
      'chaque élément de update doit être { cloudAssetId, ... }, jamais un identifiant nu');
  }
  const { cloudAssetId, note, order } = value as Record<string, unknown>;
  if (typeof cloudAssetId !== 'string') {
    throw invalidParameter(`update[${String(index)}].cloudAssetId`, JSON.stringify(cloudAssetId),
      'cloudAssetId doit être une chaîne');
  }
  const item: TaskImageUpdateItem = { cloudAssetId };
  if (note !== undefined) {
    if (note !== null && typeof note !== 'string') {
      throw invalidParameter(`update[${String(index)}].note`, JSON.stringify(note), 'note doit être une chaîne ou null');
    }
    Object.assign(item, { note });
  }
  if (order !== undefined) {
    if (typeof order !== 'number') {
      throw invalidParameter(`update[${String(index)}].order`, JSON.stringify(order), 'order doit être un nombre');
    }
    Object.assign(item, { order });
  }
  return item;
}

function parseImageRemoveItem(value: unknown, index: number): string {
  if (typeof value !== 'string') {
    throw invalidParameter(`remove[${String(index)}]`, JSON.stringify(value), 'chaque élément de remove doit être une chaîne');
  }
  return value;
}

function parseImagesMutation(body: unknown): TaskImagesMutation {
  if (typeof body !== 'object' || body === null) {
    throw invalidParameter('body', JSON.stringify(body), 'corps de requête invalide');
  }
  const { add, remove, update } = body as Record<string, unknown>;
  const mutation: Record<string, unknown> = {};
  if (add !== undefined) {
    if (!Array.isArray(add)) throw invalidParameter('add', JSON.stringify(add), 'add doit être un tableau');
    mutation.add = add.map(parseImageAddItem);
  }
  if (remove !== undefined) {
    if (!Array.isArray(remove)) throw invalidParameter('remove', JSON.stringify(remove), 'remove doit être un tableau');
    mutation.remove = remove.map(parseImageRemoveItem);
  }
  if (update !== undefined) {
    if (!Array.isArray(update)) throw invalidParameter('update', JSON.stringify(update), 'update doit être un tableau');
    mutation.update = update.map(parseImageUpdateItem);
  }
  return mutation;
}

export interface TasksRoutesDeps {
  readonly pool: Pool;
  readonly jobStore: JobStore;
  readonly exportDeps: ExportServiceDeps;
}

function parseExportInput(body: unknown): TaskExportInput {
  if (body === undefined || body === null) return {};
  if (typeof body !== 'object') {
    throw invalidParameter('body', JSON.stringify(body), 'corps de requête invalide');
  }
  const { directory, overwrite } = body as Record<string, unknown>;
  const input: Record<string, unknown> = {};
  if (directory !== undefined) {
    if (typeof directory !== 'string') {
      throw invalidParameter('directory', JSON.stringify(directory), 'directory doit être une chaîne');
    }
    input.directory = directory;
  }
  if (overwrite !== undefined) {
    if (typeof overwrite !== 'boolean') {
      throw invalidParameter('overwrite', JSON.stringify(overwrite), 'overwrite doit être un booléen');
    }
    input.overwrite = overwrite;
  }
  return input;
}

function isTextRef(value: unknown): value is TaskTextRef {
  return typeof value === 'object' && value !== null
    && typeof (value as { kind?: unknown }).kind === 'string'
    && typeof (value as { id?: unknown }).id === 'string';
}

/** Validation superficielle — la forme des tableaux, pas chaque `TextRef`. */
/** Même raison que `parseImageAddItem` : un `TaskTextRef` nu (une chaîne) ne doit jamais se lire comme un texte inconnu. */
function parseTaskTextRefItem(value: unknown, parameter: string): TaskTextRef {
  if (typeof value !== 'object' || value === null) {
    throw invalidParameter(parameter, JSON.stringify(value), `${parameter} doit être { kind, id }, jamais un identifiant nu`);
  }
  const { kind, id } = value as Record<string, unknown>;
  if (typeof kind !== 'string' || typeof id !== 'string') {
    throw invalidParameter(parameter, JSON.stringify(value), `${parameter} doit être { kind, id }`);
  }
  return { kind, id };
}

function parseReorderItem(value: unknown, index: number): { ref: TaskTextRef; order: number } {
  if (typeof value !== 'object' || value === null) {
    throw invalidParameter(`reorder[${String(index)}]`, JSON.stringify(value), 'chaque élément de reorder doit être { ref, order }');
  }
  const { ref, order } = value as Record<string, unknown>;
  const parsedRef = parseTaskTextRefItem(ref, `reorder[${String(index)}].ref`);
  if (typeof order !== 'number') {
    throw invalidParameter(`reorder[${String(index)}].order`, JSON.stringify(order), 'order doit être un nombre');
  }
  return { ref: parsedRef, order };
}

function parseTextsMutation(body: unknown): TaskTextsMutation {
  if (typeof body !== 'object' || body === null) {
    throw invalidParameter('body', JSON.stringify(body), 'corps de requête invalide');
  }
  const { add, remove, reorder } = body as Record<string, unknown>;
  const mutation: Record<string, unknown> = {};
  if (add !== undefined) {
    if (!Array.isArray(add)) throw invalidParameter('add', JSON.stringify(add), 'add doit être un tableau');
    mutation.add = add.map((item: unknown, index: number) => parseTaskTextRefItem(item, `add[${String(index)}]`));
  }
  if (remove !== undefined) {
    if (!Array.isArray(remove)) throw invalidParameter('remove', JSON.stringify(remove), 'remove doit être un tableau');
    mutation.remove = remove.map((item: unknown, index: number) => parseTaskTextRefItem(item, `remove[${String(index)}]`));
  }
  if (reorder !== undefined) {
    if (!Array.isArray(reorder)) throw invalidParameter('reorder', JSON.stringify(reorder), 'reorder doit être un tableau');
    mutation.reorder = reorder.map(parseReorderItem);
  }
  return mutation;
}

function parseAttachedTo(value: unknown): { images: readonly string[]; texts: readonly TaskTextRef[] } {
  if (typeof value !== 'object' || value === null) {
    throw invalidParameter('attachedTo', JSON.stringify(value), 'attachedTo doit être { images, texts }');
  }
  const { images, texts } = value as Record<string, unknown>;
  if (!Array.isArray(images) || !images.every((v) => typeof v === 'string')) {
    throw invalidParameter('attachedTo.images', JSON.stringify(images), 'attachedTo.images doit être un tableau de chaînes');
  }
  if (!Array.isArray(texts) || !texts.every(isTextRef)) {
    throw invalidParameter('attachedTo.texts', JSON.stringify(texts), 'attachedTo.texts doit être un tableau de TextRef');
  }
  return { images, texts };
}

function parseNoteCreateInput(body: unknown): TaskNoteCreateInput {
  if (typeof body !== 'object' || body === null) {
    throw invalidParameter('body', JSON.stringify(body), 'corps de requête invalide');
  }
  const { title, text, attachedTo, derivedFrom } = body as Record<string, unknown>;
  if (typeof title !== 'string') throw invalidParameter('title', JSON.stringify(title), 'title doit être une chaîne');
  if (typeof text !== 'string') throw invalidParameter('text', JSON.stringify(text), 'text doit être une chaîne');
  const input: TaskNoteCreateInput = { title, text, attachedTo: parseAttachedTo(attachedTo) };
  if (derivedFrom !== undefined) Object.assign(input, { derivedFrom: parseTaskTextRefItem(derivedFrom, 'derivedFrom') });
  return input;
}

function parseNotePatchInput(body: unknown): TaskNotePatchInput {
  if (typeof body !== 'object' || body === null) {
    throw invalidParameter('body', JSON.stringify(body), 'corps de requête invalide');
  }
  const { title, text, attachedTo } = body as Record<string, unknown>;
  const patch: TaskNotePatchInput = {};
  if (title !== undefined) {
    if (typeof title !== 'string') throw invalidParameter('title', JSON.stringify(title), 'title doit être une chaîne');
    Object.assign(patch, { title });
  }
  if (text !== undefined) {
    if (typeof text !== 'string') throw invalidParameter('text', JSON.stringify(text), 'text doit être une chaîne');
    Object.assign(patch, { text });
  }
  if (attachedTo !== undefined) Object.assign(patch, { attachedTo: parseAttachedTo(attachedTo) });
  return patch;
}

function parseDuplicateInput(body: unknown): TaskDuplicateInput {
  if (typeof body !== 'object' || body === null) {
    throw invalidParameter('body', JSON.stringify(body), 'corps de requête invalide');
  }
  const { title, slug } = body as Record<string, unknown>;
  if (typeof title !== 'string' || title.trim() === '') {
    throw invalidParameter('title', JSON.stringify(title), 'title doit être une chaîne non vide');
  }
  if (typeof slug !== 'string') throw invalidParameter('slug', JSON.stringify(slug), 'slug doit être une chaîne');
  return { title, slug };
}

export function registerTasksRoutes(server: FastifyInstance, deps: TasksRoutesDeps): void {
  const { pool, jobStore, exportDeps } = deps;
  const { tasksRoot } = exportDeps;

  server.get('/tasks', async (): Promise<{ items: readonly TaskSummary[] }> => {
    const client = await pool.connect();
    try {
      const items = await listTasks(client);
      return { items: items.map((task) => resolveTaskExportDirectory(task, tasksRoot)) };
    } finally {
      client.release();
    }
  });

  server.post('/tasks', async (request, reply): Promise<TaskDetail> => {
    const input = parseCreateInput(request.body);
    assertValidSlug(input.slug);
    assertOrderedPeriod(input.period);

    const client = await pool.connect();
    let result;
    try {
      result = await createTask(client, input);
    } finally {
      client.release();
    }
    if (result.kind === 'slug_taken') {
      throw new AppError(ErrorCode.SLUG_TAKEN, `slug déjà pris : ${input.slug}`, 409,
        { slug: input.slug, existingTaskTitle: result.existingTitle });
    }
    void reply.code(201);
    return resolveTaskExportDirectory(result.task, tasksRoot);
  });

  server.get('/tasks/:slug', async (request): Promise<TaskDetail> => {
    const { slug } = request.params as { slug: string };
    const client = await pool.connect();
    let detail;
    try {
      detail = await getTaskDetail(client, slug);
    } finally {
      client.release();
    }
    if (detail === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `tâche introuvable : ${slug}`, 404, { resource: 'task', id: slug });
    }
    return resolveTaskExportDirectory(detail, tasksRoot);
  });

  server.patch('/tasks/:slug', async (request): Promise<TaskSummary> => {
    const { slug } = request.params as { slug: string };
    const patch = parsePatchInput(request.body, tasksRoot);
    assertOrderedPeriod(patch.period);

    const client = await pool.connect();
    let summary;
    try {
      summary = await patchTask(client, slug, patch);
    } finally {
      client.release();
    }
    if (summary === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `tâche introuvable : ${slug}`, 404, { resource: 'task', id: slug });
    }
    return resolveTaskExportDirectory(summary, tasksRoot);
  });

  server.post('/tasks/:slug/images', async (request): Promise<TaskImagesMutationResult> => {
    const { slug } = request.params as { slug: string };
    const mutation = parseImagesMutation(request.body);

    // `add`/`remove`/`update` d'un seul geste : une transaction, jamais une
    // par ligne (tâche 17, contrat §7.2).
    const result = await withTransaction(pool, (client) => mutateTaskImages(client, slug, mutation));
    if (result === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `tâche introuvable : ${slug}`, 404, { resource: 'task', id: slug });
    }
    return result;
  });

  // Le job fait le travail réel (`exportTask`, tâche 18) ; ici, on ne fait
  // que le soumettre — 202 immédiatement, jamais une requête qui attend
  // le rendu de 286 images (contrat §7.4).
  server.post('/tasks/:slug/export', (request, reply): Job => {
    const { slug } = request.params as { slug: string };
    const input = parseExportInput(request.body);

    // `job.result` respecte l'union `JobResult` du contrat — `{ type, report }`,
    // jamais le rapport nu — pour que le client puisse discriminer sur `type`.
    const result = jobStore.submit('export',
      async () => ({ type: 'export' as const, report: await exportTask(exportDeps, slug, input) }));
    if (result.kind === 'conflict') {
      throw new AppError(ErrorCode.IMPORT_IN_PROGRESS,
        `un job mutant est déjà en cours : ${result.runningJobId}`, 409, { jobId: result.runningJobId });
    }
    void reply.code(202);
    return result.job;
  });

  server.post('/tasks/:slug/texts', async (request): Promise<TaskTextsMutationResult> => {
    const { slug } = request.params as { slug: string };
    const mutation = parseTextsMutation(request.body);

    const result = await withTransaction(pool, (client) => mutateTaskTexts(client, slug, mutation));
    if (result === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `tâche introuvable : ${slug}`, 404, { resource: 'task', id: slug });
    }
    return result;
  });

  server.post('/tasks/:slug/notes', async (request, reply): Promise<TaskNote> => {
    const { slug } = request.params as { slug: string };
    const input = parseNoteCreateInput(request.body);

    const note = await withTransaction(pool, (client) => createTaskNote(client, slug, input));
    if (note === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `tâche introuvable : ${slug}`, 404, { resource: 'task', id: slug });
    }
    void reply.code(201);
    return note;
  });

  server.patch('/tasks/:slug/notes/:noteId', async (request): Promise<TaskNote> => {
    const { slug, noteId } = request.params as { slug: string; noteId: string };
    const patch = parseNotePatchInput(request.body);

    const note = await withTransaction(pool, async (client) => {
      // Le verrou de préfixe d'attribution est tenu ICI, pas côté client : un
      // titre est le SEUL porteur de provenance de `textes/notes.md` (contrat
      // A6, spec v1.5).
      if (patch.title !== undefined) {
        const current = await loadNoteById(client, noteId);
        if (current !== null && !titleKeepsPrefix(current.title, patch.title)) {
          const prefix = attributionPrefix(current.title);
          throw new AppError(ErrorCode.ATTRIBUTION_PREFIX_REMOVED,
            "le préfixe d'attribution d'une note ne peut pas être retiré", 422, { noteId, prefix });
        }
      }
      return await patchTaskNote(client, slug, noteId, patch);
    });
    if (note === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `note introuvable : ${noteId}`, 404, { resource: 'note', id: noteId });
    }
    return note;
  });

  server.delete('/tasks/:slug/notes/:noteId', async (request, reply): Promise<void> => {
    const { slug, noteId } = request.params as { slug: string; noteId: string };

    const deleted = await withTransaction(pool, (client) => deleteTaskNote(client, slug, noteId));
    if (!deleted) {
      throw new AppError(ErrorCode.NOT_FOUND, `note introuvable : ${noteId}`, 404, { resource: 'note', id: noteId });
    }
    void reply.code(204);
  });

  // Les huit compteurs du bandeau se calculent ici — jamais dérivés côté
  // client, où ils dupliqueraient LE prédicat de recouvrement (contrat §7.3).
  server.get('/tasks/:slug/review', async (request): Promise<TaskReview> => {
    const { slug } = request.params as { slug: string };
    const client = await pool.connect();
    let review;
    try {
      review = await getTaskReview(client, slug);
    } finally {
      client.release();
    }
    if (review === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `tâche introuvable : ${slug}`, 404, { resource: 'task', id: slug });
    }
    return { ...review, task: resolveTaskExportDirectory(review.task, tasksRoot) };
  });

  // Copie la sélection et le brief/period — jamais l'état d'export : la
  // copie naît `draft` (tâche 26).
  server.post('/tasks/:slug/duplicate', async (request, reply): Promise<TaskDetail> => {
    const { slug: sourceSlug } = request.params as { slug: string };
    const input = parseDuplicateInput(request.body);
    assertValidSlug(input.slug);

    const result = await withTransaction(pool, (client) => duplicateTask(client, sourceSlug, input));
    if (result.kind === 'source_not_found') {
      throw new AppError(ErrorCode.NOT_FOUND, `tâche introuvable : ${sourceSlug}`, 404, { resource: 'task', id: sourceSlug });
    }
    if (result.kind === 'slug_taken') {
      throw new AppError(ErrorCode.SLUG_TAKEN, `slug déjà pris : ${input.slug}`, 409,
        { slug: input.slug, existingTaskTitle: result.existingTitle });
    }
    void reply.code(201);
    return resolveTaskExportDirectory(result.task, tasksRoot);
  });

  // Ne touche JAMAIS au dossier déjà exporté — la réponse le nomme pour que
  // la confirmation puisse le dire (contrat §7).
  server.delete('/tasks/:slug', async (request): Promise<TaskDeleteResult> => {
    const { slug } = request.params as { slug: string };
    const result = await withTransaction(pool, (client) => deleteTask(client, slug));
    if (result === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `tâche introuvable : ${slug}`, 404, { resource: 'task', id: slug });
    }
    return result;
  });
}
