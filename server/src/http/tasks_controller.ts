import type { FastifyInstance } from 'fastify';

import { ErrorCode } from '@shared/enums';
import { AppError } from '../contract/error_interface.ts';
import type { TaskCreateInput, TaskDetail, TaskPatchInput, TaskPeriod, TaskSummary } from '../contract/task_interface.ts';
import type { Pool } from '../db/pool.ts';
import { createTask, getTaskDetail, listTasks, patchTask } from '../repository/task_repository.ts';

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

function parsePatchInput(body: unknown): TaskPatchInput {
  if (typeof body !== 'object' || body === null) {
    throw invalidParameter('body', JSON.stringify(body), 'corps de requête invalide');
  }
  const { title, brief, period } = body as Record<string, unknown>;
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
  return patch;
}

export function registerTasksRoutes(server: FastifyInstance, deps: { pool: Pool }): void {
  const { pool } = deps;

  server.get('/tasks', async (): Promise<{ items: readonly TaskSummary[] }> => {
    const client = await pool.connect();
    try {
      return { items: await listTasks(client) };
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
    return result.task;
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
    return detail;
  });

  server.patch('/tasks/:slug', async (request): Promise<TaskSummary> => {
    const { slug } = request.params as { slug: string };
    const patch = parsePatchInput(request.body);
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
    return summary;
  });
}
