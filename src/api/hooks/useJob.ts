import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../client';
import { JobSchema, type Job } from '../contract/job';

const TERMINAL_STATES = new Set(['succeeded', 'failed', 'cancelled']);

/**
 * `GET /jobs/:id`, polled every 250 ms while the job is not yet terminal
 * (`JobSchema`'s own note: a 200-image export runs about four seconds, so
 * this costs sixteen local requests against a whole transport mechanism to
 * build and test). `POST /tasks/:slug/export` (`useExport`) only ever hands
 * back a `queued`/`running` job — this hook is what turns that into a
 * `succeeded`/`failed` one the screen can actually render.
 *
 * `jobId: null` means "nothing submitted yet" — the query stays disabled
 * rather than polling a job that does not exist.
 */
export function useJob(jobId: string | null): UseQueryResult<Job> {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: ({ signal }) => apiGet(`/jobs/${String(jobId)}`, JobSchema, signal),
    enabled: jobId !== null,
    refetchInterval: (query) => (TERMINAL_STATES.has(query.state.data?.state ?? '') ? false : 250),
  });
}
