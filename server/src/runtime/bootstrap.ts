import { realpath } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';

import { createLog } from '../log/log.ts';
import { createPool, type Pool } from '../db/pool.ts';
import { createSafeFs } from '../io/safe_fs.ts';
import { registerImagesRoutes } from '../http/images_controller.ts';
import { registerJobsRoutes } from '../http/jobs_controller.ts';
import { registerPhotosRoutes } from '../http/photos_controller.ts';
import { registerRefRoutes } from '../http/ref_controller.ts';
import { registerSystemRoutes } from '../http/system_controller.ts';
import { registerTasksRoutes } from '../http/tasks_controller.ts';
import { registerTextsRoutes } from '../http/texts_controller.ts';
import type { ExportServiceDeps } from '../metier/export/export_service.ts';
import type { ImageServiceDeps } from '../metier/images/image_service.ts';
import { InFlightRenders } from '../metier/images/in_flight_renders.ts';
import { JobStore } from '../metier/jobs/job_service.ts';
import { buildServer } from './server.ts';
import { loadConfig } from './config.ts';

export interface App {
  readonly server: FastifyInstance;
  close(): Promise<void>;
}

/**
 * LE composition root — le seul module qui construit. Tout le reste reçoit
 * ses dépendances par constructeur ; aucun conteneur de DI (D2 du plan).
 *
 * Vérification des racines au démarrage (`docs/backend-spec.md` §3.2), et
 * l'exception qui compte : `ORIGINALS_ROOT`/`THUMBS_ROOT` peuvent manquer —
 * le volume externe se démonte en session — le serveur démarre quand même,
 * `GET /system/status` le dira. Toutes les autres racines refusent de
 * démarrer, en nommant la variable.
 */
export async function bootstrap(env: NodeJS.ProcessEnv): Promise<App> {
  const config = loadConfig(env);
  const log = createLog(config.logLevel);
  const pool: Pool = createPool(config.databaseUrl);

  // Racines INSCRIPTIBLES et racines EN LECTURE mais INDISPENSABLES (les
  // quatre bases amont, les pages scannées) : refusent toutes de démarrer,
  // contrairement à ORIGINALS_ROOT/THUMBS_ROOT plus bas. `createSafeFs` fait
  // ce contrôle lui-même pour les inscriptibles, mais son message ne nomme
  // que le CHEMIN, jamais la variable — on vérifie donc chacune ici d'abord,
  // pour un refus qui se corrige sans deviner quelle variable il vise.
  const requiredRoots: readonly (readonly [string, string])[] = [
    ['RENDER_CACHE_ROOT', config.renderCacheRoot], ['TASKS_ROOT', config.tasksRoot],
    ...(config.featureDatingExport ? [['ANNOTATIONS_DIR', config.annotationsDir] as const] : []),
    ['PIPELINE_DB_ROOT', config.pipelineDbRoot], ['PAGES_ROOT', config.pagesRoot],
  ];
  for (const [envVar, rootPath] of requiredRoots) {
    try {
      await realpath(rootPath);
    } catch {
      throw new Error(`${envVar} est introuvable : ${rootPath}`);
    }
  }

  const safeFs = await createSafeFs(config.writableRoots, log);

  // UN SEUL `InFlightRenders` par processus (tâche 15) : les images à la
  // volée, l'export et le pré-rendu partagent le même sémaphore et le même
  // dédoublonnage — deux instances doubleraient silencieusement la
  // concurrence effective sur `sips`.
  const imageService: ImageServiceDeps = {
    thumbsRoot: config.thumbsRoot,
    originalsRoot: config.originalsRoot,
    renderCacheRoot: config.renderCacheRoot,
    safeFs,
    inFlight: new InFlightRenders(config.renderConcurrency),
  };
  const exportDeps: ExportServiceDeps = {
    pool, safeFs, tasksRoot: config.tasksRoot, pagesRoot: config.pagesRoot, imageService,
  };
  // Un seul job mutant à la fois, TOUS TYPES CONFONDUS (§4.7) : une seule
  // instance, partagée entre `/tasks/:slug/export` et `/jobs/*`.
  const jobStore = new JobStore();

  const server = buildServer(log);
  registerSystemRoutes(server, { pool, config });
  registerPhotosRoutes(server, { pool, config });
  registerRefRoutes(server, { pool });
  registerTasksRoutes(server, { pool, jobStore, exportDeps });
  registerImagesRoutes(server, { pool, imageService });
  registerJobsRoutes(server, { pool, jobStore, config, imageService });
  registerTextsRoutes(server, { pool, pagesRoot: config.pagesRoot });
  await server.ready();

  log.info('serveur prêt', { host: config.host, port: config.port });

  return {
    server,
    async close(): Promise<void> {
      await server.close();
      await pool.end();
    },
  };
}
