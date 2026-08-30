import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { apiPost, type ApiError } from '../client';
import { JobSchema, type Job } from '../contract/job';

/**
 * Starts an export. The server ALWAYS answers 202 with a `queued`/`running`
 * job — `exportTask()` runs entirely inside the async job runner
 * (`server/src/http/tasks_controller.ts`), so an existing target directory
 * never surfaces as a synchronous error here. Pair with `useJob(job.id)` to
 * poll it to a terminal state and read the real outcome — never overwrite
 * in silence (spec §5.6), but "the directory exists" is something only the
 * polled job can say.
 */
export function useExport(slug: string): UseMutationResult<Job, ApiError, { overwrite: boolean }> {
  return useMutation<Job, ApiError, { overwrite: boolean }>({
    mutationFn: (input) => apiPost(`/tasks/${slug}/export`, input, JobSchema),
  });
}
