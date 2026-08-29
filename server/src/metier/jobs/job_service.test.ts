import { describe, expect, test } from 'vitest';

import { must } from '../../../test/helpers/assert.ts';
import { createJob, JobStore } from './job_service.ts';

describe('createJob', () => {
  test('total is null while unknown — never 0, which would read as done', () => {
    expect(createJob('prerender').progress).toEqual({ done: 0, total: null, label: null });
  });

  test('state starts queued, timestamps and result start null', () => {
    const job = createJob('export');
    expect(job.state).toBe('queued');
    expect(job.startedAt).toBeNull();
    expect(job.finishedAt).toBeNull();
    expect(job.result).toBeNull();
    expect(job.error).toBeNull();
  });

  test('each job gets a distinct id', () => {
    expect(createJob('import').id).not.toBe(createJob('import').id);
  });
});

describe('JobStore', () => {
  test('only ONE mutating job at a time — a second submit is a named conflict', async () => {
    const store = new JobStore();
    let releaseFirst!: () => void;
    const blocked = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = store.submit('import', async () => { await blocked; return { type: 'import', report: {} } as never; });
    expect(first.kind).toBe('started');

    const second = store.submit('export', () => Promise.resolve({ type: 'export', report: {} } as never));
    if (first.kind !== 'started') throw new Error('setup');
    expect(second).toEqual({ kind: 'conflict', runningJobId: first.job.id });

    releaseFirst();
    await first.settled;
  });

  test('a job that resolves is marked succeeded, with its result attached', async () => {
    const store = new JobStore();
    const submitted = store.submit('export', () => Promise.resolve({ type: 'export', report: { ok: true } } as never));
    if (submitted.kind !== 'started') throw new Error('setup');
    await submitted.settled;

    const job = store.get(submitted.job.id);
    expect(job?.state).toBe('succeeded');
    expect(job?.result).toEqual({ type: 'export', report: { ok: true } });
    expect(job?.finishedAt).not.toBeNull();
  });

  test('a job that throws is marked failed, the error named — never an unhandled rejection', async () => {
    const store = new JobStore();
    const submitted = store.submit('import', () => Promise.reject(new Error('la base est verrouillée')));
    if (submitted.kind !== 'started') throw new Error('setup');
    await submitted.settled;

    const job = store.get(submitted.job.id);
    expect(job?.state).toBe('failed');
    expect(job?.error).toEqual({ code: 'INTERNAL', message: 'la base est verrouillée' });
  });

  test('runningJobId names the one mutating job while it runs, and clears once it settles', async () => {
    const store = new JobStore();
    expect(store.runningJobId()).toBeNull();

    let releaseFirst!: () => void;
    const blocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = store.submit('import', async () => { await blocked; return { type: 'import', report: {} } as never; });
    if (first.kind !== 'started') throw new Error('setup');
    expect(store.runningJobId()).toBe(first.job.id);

    releaseFirst();
    await first.settled;
    expect(store.runningJobId()).toBeNull();
  });

  test('once a job settles, the lock frees and a new job can start', async () => {
    const store = new JobStore();
    const first = store.submit('import', () => Promise.resolve({ type: 'import', report: {} } as never));
    if (first.kind !== 'started') throw new Error('setup');
    await first.settled;

    const second = store.submit('export', () => Promise.resolve({ type: 'export', report: {} } as never));
    expect(second.kind).toBe('started');
  });

  test('get returns null for an unknown id, never throws', () => {
    expect(new JobStore().get('nowhere')).toBeNull();
  });

  test('list returns the most recent jobs first, capped at 20', async () => {
    const store = new JobStore();
    for (let i = 0; i < 25; i++) {
      const submitted = store.submit('export', () => Promise.resolve({ type: 'export', report: {} } as never));
      if (submitted.kind === 'started') await submitted.settled;
    }
    const items = store.list();
    expect(items).toHaveLength(20);
    const newest = must(items[0], 'items[0] manquant');
    const oldest = must(items[19], 'items[19] manquant');
    expect(newest.createdAt >= oldest.createdAt).toBe(true);
  });

  test('progress updates are visible through get while the job runs', async () => {
    const store = new JobStore();
    let reportProgress!: (done: number, total: number | null, label: string | null) => void;
    const submitted = store.submit('prerender', async (progress) => {
      reportProgress = progress;
      await new Promise((resolve) => { setTimeout(resolve, 5); });
      return { type: 'prerender', rendered: 1, failed: 0 } as never;
    });
    if (submitted.kind !== 'started') throw new Error('setup');
    reportProgress(3, 10, 'set/x');
    expect(store.get(submitted.job.id)?.progress).toEqual({ done: 3, total: 10, label: 'set/x' });
    await submitted.settled;
  });

  test('cancel marks a cancellable running job cancelled and its signal true; a settled job is untouched', async () => {
    const store = new JobStore();
    let sawCancel = false;
    const submitted = store.submit('prerender', async (_progress, signal) => {
      await new Promise((resolve) => { setTimeout(resolve, 5); });
      sawCancel = signal.cancelled;
      return { type: 'prerender', rendered: 0, failed: 0 } as never;
    });
    if (submitted.kind !== 'started') throw new Error('setup');

    const cancelled = store.cancel(submitted.job.id);
    expect(cancelled?.state).toBe('cancelled');
    await submitted.settled;
    expect(sawCancel).toBe(true);

    expect(store.cancel('nowhere')).toBeNull();
  });
});
