import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';

import { server } from '../../../mocks/node';
import { testQueryClient } from '../../test/renderWithProviders';

import { useJob } from './useJob';

function wrapper() {
  const client = testQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const RUNNING = {
  id: 'job_1', type: 'export', state: 'running',
  createdAt: '2026-08-30T10:00:00.000Z', startedAt: '2026-08-30T10:00:00.000Z', finishedAt: null,
  progress: { done: 0, total: 1, label: null }, cancellable: false, result: null, error: null,
};
const SUCCEEDED = {
  ...RUNNING, state: 'succeeded', finishedAt: '2026-08-30T10:00:01.000Z',
  progress: { done: 1, total: 1, label: null },
  result: {
    type: 'export',
    report: {
      directory: '/tasks/x', manifestPath: '/tasks/x/manifest.json',
      imagesWritten: 1, pagesWritten: 0, textsWritten: 0, notesWritten: 0, bytesWritten: 10,
      skippedImages: [], partial: false, exportedAt: '2026-08-30T10:00:01.000Z',
    },
  },
};

describe('§7.4 — GET /jobs/:id, polled to a terminal state', () => {
  test('a running job is polled until it turns terminal, then polling stops', async () => {
    let calls = 0;
    server.use(
      http.get('*/jobs/job_1', () => {
        calls += 1;
        return HttpResponse.json(calls === 1 ? RUNNING : SUCCEEDED);
      }),
    );

    const { result } = renderHook(() => useJob('job_1'), { wrapper: wrapper() });

    await waitFor(() => { expect(result.current.data?.state).toBe('running'); });
    await waitFor(() => { expect(result.current.data?.state).toBe('succeeded'); }, { timeout: 3000 });
    expect(result.current.data?.result?.report.imagesWritten).toBe(1);

    // Polling stopped: no further calls land once terminal.
    const callsAtTerminal = calls;
    await new Promise((resolve) => { setTimeout(resolve, 400); });
    expect(calls).toBe(callsAtTerminal);
  });

  test('jobId: null never fires a request — nothing submitted yet', () => {
    let called = false;
    server.use(http.get('*/jobs/:jobId', () => { called = true; return HttpResponse.json(SUCCEEDED); }));

    const { result } = renderHook(() => useJob(null), { wrapper: wrapper() });

    expect(result.current.fetchStatus).toBe('idle');
    expect(called).toBe(false);
  });
});
