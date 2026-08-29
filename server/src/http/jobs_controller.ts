import path from 'node:path';

import type { FastifyInstance } from 'fastify';

import { ErrorCode } from '@shared/enums';
import { AppError } from '../contract/error_interface.ts';
import type { Pool } from '../db/pool.ts';
import { runImport } from '../import/import_service.ts';
import type { Job, JobStore } from '../metier/jobs/job_service.ts';
import type { ImageServiceDeps } from '../metier/images/image_service.ts';
import { runPrerender } from '../metier/images/prerender_service.ts';
import type { Config } from '../runtime/config.ts';

export interface JobsRoutesDeps {
  readonly pool: Pool;
  readonly jobStore: JobStore;
  readonly config: Config;
  readonly imageService: ImageServiceDeps;
}

function conflictOrAccepted(
  reply: { code(status: number): void }, result: { readonly kind: 'started'; readonly job: Job }
    | { readonly kind: 'conflict'; readonly runningJobId: string },
): Job {
  if (result.kind === 'conflict') {
    throw new AppError(ErrorCode.IMPORT_IN_PROGRESS,
      `un job mutant est déjà en cours : ${result.runningJobId}`, 409, { jobId: result.runningJobId });
  }
  reply.code(202);
  return result.job;
}

export function registerJobsRoutes(server: FastifyInstance, deps: JobsRoutesDeps): void {
  const { pool, jobStore, config, imageService } = deps;

  server.get('/jobs', (): { items: readonly Job[] } => ({ items: jobStore.list() }));

  server.get('/jobs/:jobId', (request): Job => {
    const { jobId } = request.params as { jobId: string };
    const job = jobStore.get(jobId);
    if (job === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `job introuvable : ${jobId}`, 404, { resource: 'job', id: jobId });
    }
    return job;
  });

  server.post('/jobs/:jobId/cancel', (request): Job => {
    const { jobId } = request.params as { jobId: string };
    const job = jobStore.cancel(jobId);
    if (job === null) {
      throw new AppError(ErrorCode.NOT_FOUND, `job introuvable : ${jobId}`, 404, { resource: 'job', id: jobId });
    }
    return job;
  });

  // Sans écran qui l'appelle (Nicolas lance l'import au terminal) — l'endpoint
  // reste pour que `GET /jobs/:id` puisse rendre compte d'un import déclenché
  // autrement, et parce que le mécanisme de job est de toute façon écrit pour
  // l'export et le pré-rendu (contrat §4.8).
  server.post('/jobs/import', (_request, reply): Job => {
    const sources = {
      mcpIndexPath: path.join(config.pipelineDbRoot, 'mcp-index.db'),
      mcpContentPath: path.join(config.pipelineDbRoot, 'mcp-content.db'),
      documentsPath: path.join(config.pipelineDbRoot, 'documents.db'),
      datingPath: path.join(config.pipelineDbRoot, 'dating.db'),
      annotationsDir: config.annotationsDir,
      originalsRoot: config.originalsRoot,
      perimeterSets: config.perimeterSets,
    };
    // `job.result` respecte l'union `JobResult` du contrat — `{ type, report }`.
    const result = jobStore.submit('import',
      async () => ({ type: 'import' as const, report: await runImport(pool, sources) }));
    return conflictOrAccepted(reply, result);
  });

  server.post('/jobs/prerender', (_request, reply): Job => {
    const result = jobStore.submit('prerender',
      (progress, signal) => runPrerender(pool, imageService, config.renderConcurrency, progress, signal));
    return conflictOrAccepted(reply, result);
  });
}
