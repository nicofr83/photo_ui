import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { apiPost, type ApiError } from '../client';
import { JobSchema, type Job } from '../contract/job';

/**
 * Starts an export. The server answers 202 with a job; a 409 means the target
 * directory already exists and the caller must decide — never a silent
 * overwrite (spec §5.6).
 */
export function useExport(slug: string): UseMutationResult<Job, ApiError, { overwrite: boolean }> {
  return useMutation<Job, ApiError, { overwrite: boolean }>({
    mutationFn: (input) => apiPost(`/tasks/${slug}/export`, input, JobSchema),
  });
}
