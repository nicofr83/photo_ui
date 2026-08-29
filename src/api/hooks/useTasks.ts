import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { apiDeleteWithBody, apiGet, apiPost, type ApiError } from '../client';
import {
  TaskDeleteResultSchema, TaskDetailSchema, TaskListSchema,
  type TaskCreateInput, type TaskDeleteResult, type TaskDetail,
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
