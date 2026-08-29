import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { apiGet, apiPost, type ApiError } from '../client';
import { TaskDetailSchema, TaskListSchema, type TaskCreateInput, type TaskDetail } from '../contract/task';

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
