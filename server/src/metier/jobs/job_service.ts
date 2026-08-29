import { randomUUID } from 'node:crypto';

import { JobState, type JobType } from '@shared/enums';

export interface JobProgress {
  readonly done: number;
  /** `null` tant que le total n'est pas connu — jamais `0`, qui se lirait comme « terminé ». */
  readonly total: number | null;
  readonly label: string | null;
}

export interface Job {
  readonly id: string;
  readonly type: JobType;
  readonly state: JobState;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly progress: JobProgress;
  readonly cancellable: boolean;
  readonly result: unknown;
  readonly error: { readonly code: string; readonly message: string } | null;
}

interface JobRecord extends Job {
  progress: JobProgress;
  state: JobState;
  startedAt: string | null;
  finishedAt: string | null;
  result: unknown;
  error: { readonly code: string; readonly message: string } | null;
  cancelRequested: boolean;
}

/**
 * Le pré-rendu boucle sur des rendus indépendants, sans transaction qui les
 * enjambe : il a un point d'arrêt sûr entre deux photos. L'import (un
 * `TRUNCATE` puis une reconstruction) et l'export (un dossier temporaire
 * jusqu'au dernier geste) n'en ont pas — les annuler laisserait un état
 * incertain, donc `cancellable` est une propriété du TYPE, jamais un choix
 * de l'appelant.
 */
const CANCELLABLE_JOB_TYPES = new Set<JobType>(['prerender']);

export function createJob(type: JobType): JobRecord {
  return {
    id: randomUUID(),
    type,
    state: JobState.QUEUED,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    progress: { done: 0, total: null, label: null },
    cancellable: CANCELLABLE_JOB_TYPES.has(type),
    result: null,
    error: null,
    cancelRequested: false,
  };
}

export type ProgressReporter = (done: number, total: number | null, label: string | null) => void;
export type CancelSignal = { readonly cancelled: boolean };
export type JobRunner<R> = (progress: ProgressReporter, signal: CancelSignal) => Promise<R>;

export type SubmitResult =
  | { readonly kind: 'started'; readonly job: Job; readonly settled: Promise<void> }
  | { readonly kind: 'conflict'; readonly runningJobId: string };

function snapshot(record: JobRecord): Job {
  const { cancelRequested: _cancelRequested, ...job } = record;
  return job;
}

/**
 * En MÉMOIRE, jamais en base : un seul processus Mac, aucun redémarrage à
 * traverser (contrat §4.7 — polling, pas de flux). Un seul job MUTANT actif
 * à la fois — la RÈGLE, jamais le nom du type demandé : import comme export
 * comme pré-rendu se bloquent mutuellement, `IMPORT_IN_PROGRESS` est le seul
 * code d'erreur que le contrat prévoit pour ce refus, quel que soit le job
 * réellement en cours.
 */
export class JobStore {
  private readonly jobs = new Map<string, JobRecord>();
  private runningId: string | null = null;

  submit<R>(type: JobType, runner: JobRunner<R>): SubmitResult {
    if (this.runningId !== null) return { kind: 'conflict', runningJobId: this.runningId };

    const record = createJob(type);
    record.state = JobState.RUNNING;
    record.startedAt = new Date().toISOString();
    this.jobs.set(record.id, record);
    this.runningId = record.id;

    const signal: CancelSignal = { get cancelled() { return record.cancelRequested; } };
    const report: ProgressReporter = (done, total, label) => {
      record.progress = { done, total, label };
    };

    const settled = runner(report, signal).then(
      (result) => {
        if (record.state !== JobState.CANCELLED) {
          record.state = JobState.SUCCEEDED;
          record.result = result;
        }
      },
      (error: unknown) => {
        if (record.state !== JobState.CANCELLED) {
          record.state = JobState.FAILED;
          record.error = { code: 'INTERNAL', message: error instanceof Error ? error.message : String(error) };
        }
      },
    ).finally(() => {
      record.finishedAt = new Date().toISOString();
      if (this.runningId === record.id) this.runningId = null;
    });

    return { kind: 'started', job: snapshot(record), settled };
  }

  /** Le job mutant en cours, le cas échéant — `SystemStatus.runningJobId` (contrat §9). */
  runningJobId(): string | null {
    return this.runningId;
  }

  get(id: string): Job | null {
    const record = this.jobs.get(id);
    return record === undefined ? null : snapshot(record);
  }

  /** Les 20 derniers, le plus récent en tête. */
  list(): readonly Job[] {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)
      .map(snapshot);
  }

  /**
   * Un job NON annulable (`import`, `export` — atomiques, sans point d'arrêt
   * sûr) ignore la demande : rien à interrompre proprement, et libérer le
   * verrou pendant qu'il tourne encore laisserait démarrer un second job en
   * même temps que le premier finit d'écrire.
   */
  cancel(id: string): Job | null {
    const record = this.jobs.get(id);
    if (record === undefined) return null;
    if (!record.cancellable || (record.state !== JobState.RUNNING && record.state !== JobState.QUEUED)) {
      return snapshot(record);
    }
    record.cancelRequested = true;
    record.state = JobState.CANCELLED;
    if (this.runningId === record.id) this.runningId = null;
    return snapshot(record);
  }
}
