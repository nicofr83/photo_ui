import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { apiDeleteWithBody, apiGet, apiPatch, apiPost, type ApiError } from '../client';
import {
  TaskDeleteResultSchema, TaskDetailSchema, TaskListSchema, TaskSummarySchema,
  type TaskCreateInput, type TaskDeleteResult, type TaskDetail, type TaskPatchInput, type TaskSummary,
} from '../contract/task';

type TaskList = z.infer<typeof TaskListSchema>;

export function useTasks(): UseQueryResult<TaskList> {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: ({ signal }) => apiGet('/tasks', TaskListSchema, signal),
  });
}

export function useCreateTask(): UseMutationResult<TaskDetail, ApiError, TaskCreateInput> {
  const client = useQueryClient();
  return useMutation<TaskDetail, ApiError, TaskCreateInput>({
    mutationFn: (input) => apiPost('/tasks', input, TaskDetailSchema),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['tasks'] }); },
  });
}

/**
 * `PATCH /tasks/:slug` — title, brief, and the period (spec §5.1: the
 * declared date range a task composes against, distinct from anything a
 * photo or text itself asserts). Any subset; the caller sends only what it
 * changed.
 */
export function useUpdateTask(slug: string): UseMutationResult<TaskSummary, ApiError, TaskPatchInput> {
  const client = useQueryClient();
  return useMutation<TaskSummary, ApiError, TaskPatchInput>({
    mutationFn: (patch) => apiPatch(`/tasks/${slug}`, patch, TaskSummarySchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['tasks'] });
      void client.invalidateQueries({ queryKey: ['task', slug] });
    },
  });
}

/** Contract §4.5: a shallow copy — same reasoning as duplicating any other
 * document, a fresh slug and title, everything else starts empty. */
export function useDuplicateTask(): UseMutationResult<
  TaskDetail, ApiError, { slug: string; title: string; newSlug: string }
> {
  const client = useQueryClient();
  return useMutation<TaskDetail, ApiError, { slug: string; title: string; newSlug: string }>({
    mutationFn: ({ slug, title, newSlug }) =>
      apiPost(`/tasks/${slug}/duplicate`, { title, slug: newSlug }, TaskDetailSchema),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['tasks'] }); },
  });
}

/** Contract §4.5: never touches an already-exported directory — the result
 * names it so the confirmation can say so. */
export function useDeleteTask(): UseMutationResult<TaskDeleteResult, ApiError, string> {
  const client = useQueryClient();
  return useMutation<TaskDeleteResult, ApiError, string>({
    mutationFn: (slug) => apiDeleteWithBody(`/tasks/${slug}`, {}, TaskDeleteResultSchema),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['tasks'] }); },
  });
}
