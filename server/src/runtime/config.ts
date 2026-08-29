import { isLogLevel, LogLevel } from '../log/log.ts';

/**
 * AUCUN chemin en dur. Le backend tourne sur le Mac de Nicolas aujourd'hui et
 * doit être déplaçable en fin de projet, donc tout passe par l'environnement.
 * Le serveur REFUSE de démarrer en nommant ce qui manque.
 */
export interface Config {
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string;

  readonly originalsRoot: string;
  readonly thumbsRoot: string;
  readonly pipelineDbRoot: string;
  readonly pagesRoot: string;
  readonly annotationsDir: string;
  readonly renderCacheRoot: string;
  readonly tasksRoot: string;

  /** Le périmètre est un PARAMÈTRE, pas une constante du code. */
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly perimeterSets: readonly string[];

  readonly renderEdge: number;
  readonly renderConcurrency: number;
  readonly featureDatingExport: boolean;
  readonly logLevel: LogLevel;

  /** Distinction de CONFIGURATION, pas de convention : `safe_fs` refuse tout le reste. */
  readonly writableRoots: readonly string[];
  readonly readOnlyRoots: readonly string[];
}

const DEFAULT_PERIMETER_SETS = ['1998-1999', '2000-2001', '2002', '2003', '2004'] as const;

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const missing: string[] = [];

  const required = (name: string): string => {
    const value = env[name];
    if (value === undefined || value.trim() === '') {
      missing.push(name);
      return '';
    }
    return value;
  };

  const integer = (name: string, fallback: number): number => {
    const raw = env[name];
    if (raw === undefined || raw.trim() === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) {
      throw new Error(`${name} doit être un entier, reçu ${JSON.stringify(raw)}`);
    }
    return parsed;
  };

  const databaseUrl = required('DATABASE_URL');
  const originalsRoot = required('ORIGINALS_ROOT');
  const thumbsRoot = required('THUMBS_ROOT');
  const pipelineDbRoot = required('PIPELINE_DB_ROOT');
  const pagesRoot = required('PAGES_ROOT');
  const annotationsDir = required('ANNOTATIONS_DIR');
  const renderCacheRoot = required('RENDER_CACHE_ROOT');
  const tasksRoot = required('TASKS_ROOT');

  // Toutes les variables manquantes d'un coup : corriger l'environnement en
  // une fois vaut mieux que découvrir la suivante au redémarrage.
  if (missing.length > 0) {
    throw new Error(`variables d'environnement manquantes : ${missing.join(', ')}`);
  }

  // Le drapeau n'est vrai que sur la chaîne exacte : c'est le seul chemin
  // d'écriture vers `adobe_mcp`, il ne s'active pas par accident.
  const featureDatingExport = env.FEATURE_DATING_EXPORT === 'true';

  const rawLevel = env.LOG_LEVEL ?? LogLevel.INFO;
  if (!isLogLevel(rawLevel)) {
    throw new Error(`LOG_LEVEL inconnu : ${JSON.stringify(rawLevel)}`);
  }

  return {
    host: env.PHOTO_UI_HOST ?? '127.0.0.1',
    port: integer('PHOTO_UI_PORT', 4310),
    databaseUrl,

    originalsRoot,
    thumbsRoot,
    pipelineDbRoot,
    pagesRoot,
    annotationsDir,
    renderCacheRoot,
    tasksRoot,

    periodFrom: env.PERIOD_FROM ?? '1998-01-01',
    periodTo: env.PERIOD_TO ?? '2004-12-31',
    perimeterSets: env.PERIMETER_SETS === undefined
      ? [...DEFAULT_PERIMETER_SETS]
      : env.PERIMETER_SETS.split(',').map((set) => set.trim()).filter((set) => set !== ''),

    renderEdge: integer('RENDER_EDGE', 1400),
    renderConcurrency: integer('RENDER_CONCURRENCY', 8),
    featureDatingExport,
    logLevel: rawLevel,

    writableRoots: featureDatingExport
      ? [renderCacheRoot, tasksRoot, annotationsDir]
      : [renderCacheRoot, tasksRoot],
    readOnlyRoots: [originalsRoot, thumbsRoot, pipelineDbRoot, pagesRoot],
  };
}
