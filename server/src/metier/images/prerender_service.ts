import { RenderEdge } from '@shared/enums';
import type { Pool } from '../../db/pool.ts';
import { mapWithConcurrency } from '../../io/concurrency.ts';
import { listPerimeterRenderSources } from '../../repository/prerender_repository.ts';
import type { CancelSignal, ProgressReporter } from '../jobs/job_service.ts';
import { getRender, type ImageServiceDeps } from './image_service.ts';

export interface PrerenderResult {
  readonly type: 'prerender';
  readonly rendered: number;
  readonly failed: number;
}

/**
 * Un rendu par contenu (`sha256`), en parallèle borné par
 * `imageService.inFlight` — le même sémaphore que les requêtes `/render` à la
 * volée, mesuré ailleurs : facteur 3 entre séquentiel et 8 en parallèle. Le
 * point d'arrêt sûr est ENTRE deux rendus (`signal.cancelled`), jamais au
 * milieu d'un `sips` déjà lancé.
 */
export async function runPrerender(
  pool: Pool, imageService: ImageServiceDeps, concurrency: number,
  progress: ProgressReporter, signal: CancelSignal,
): Promise<PrerenderResult> {
  const client = await pool.connect();
  let sources;
  try {
    sources = await listPerimeterRenderSources(client);
  } finally {
    client.release();
  }

  let rendered = 0;
  let failed = 0;
  let done = 0;
  progress(0, sources.length, null);

  await mapWithConcurrency(sources, concurrency, async (source) => {
    if (signal.cancelled) return;
    const result = await getRender(imageService, source.sha256, {
      relativePath: source.relativePath, format: source.format,
    }, RenderEdge.DETAIL);
    if (result.failure === null) rendered++; else failed++;
    done++;
    progress(done, sources.length, source.relativePath);
  });

  return { type: 'prerender', rendered, failed };
}
