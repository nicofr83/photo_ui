import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiDelete, apiPatch, apiPost, type ApiError } from '../client';
import {
  TaskNoteSchema, type TaskNote, type TaskNoteCreateInput, type TaskNotePatchInput,
} from '../contract/task';

export interface Notes {
  readonly isPending: boolean;
  readonly error: ApiError | null;
  readonly create: (input: TaskNoteCreateInput) => Promise<TaskNote>;
  readonly update: (noteId: string, patch: TaskNotePatchInput) => Promise<TaskNote>;
  readonly remove: (noteId: string) => Promise<void>;
}

/** Contract §4.5: POST/PATCH/DELETE on /tasks/:slug/notes. Spec §5.5. */
export function useNotes(slug: string): Notes {
  const client = useQueryClient();
  const key = ['task', slug];
  const invalidate = (): Promise<void> => client.invalidateQueries({ queryKey: key });

  const createMutation = useMutation<TaskNote, ApiError, TaskNoteCreateInput>({
    mutationFn: (input) => apiPost(`/tasks/${slug}/notes`, input, TaskNoteSchema),
    onSuccess: () => { void invalidate(); },
  });

  const updateMutation = useMutation<
    TaskNote, ApiError, { noteId: string; patch: TaskNotePatchInput }
  >({
    mutationFn: ({ noteId, patch }) =>
      apiPatch(`/tasks/${slug}/notes/${noteId}`, patch, TaskNoteSchema),
    onSuccess: () => { void invalidate(); },
  });

  const removeMutation = useMutation<undefined, ApiError, string>({
    mutationFn: async (noteId) => {
      await apiDelete(`/tasks/${slug}/notes/${noteId}`);
      return undefined;
    },
    onSuccess: () => { void invalidate(); },
  });

  return {
    isPending: createMutation.isPending || updateMutation.isPending || removeMutation.isPending,
    error: createMutation.error ?? updateMutation.error ?? removeMutation.error,
    create: (input) => createMutation.mutateAsync(input),
    update: (noteId, patch) => updateMutation.mutateAsync({ noteId, patch }),
    remove: (noteId) => removeMutation.mutateAsync(noteId),
  };
}
