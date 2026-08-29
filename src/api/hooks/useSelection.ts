import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPost, type ApiError } from '../client';
import {
  TaskDetailSchema, TaskImagesMutationResultSchema,
  type TaskImagesMutationResult,
} from '../contract/task';
import type { SelectionReason } from '../../shared/enums';

interface Mutation {
  readonly add?: readonly string[];
  readonly remove?: readonly string[];
  readonly selectedBecause?: readonly SelectionReason[];
}

export interface Selection {
  readonly selected: ReadonlySet<string>;
  readonly isPending: boolean;
  readonly error: ApiError | null;
  /**
   * ONE request for the whole batch: selecting an album of 286 photos is a
   * gesture, not 286 requests (spec §9.3).
   */
  readonly add: (
    cloudAssetIds: readonly string[],
    selectedBecause?: readonly SelectionReason[],
  ) => Promise<TaskImagesMutationResult>;
  readonly remove: (cloudAssetIds: readonly string[]) => Promise<TaskImagesMutationResult>;
}

export function useSelection(slug: string): Selection {
  const client = useQueryClient();
  const key = ['task', slug];

  const task = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiGet(`/tasks/${slug}`, TaskDetailSchema, signal),
  });

  const mutation = useMutation<TaskImagesMutationResult, ApiError, Mutation>({
    mutationFn: (body) =>
      apiPost(`/tasks/${slug}/images`, body, TaskImagesMutationResultSchema),
    // Invalidate rather than patch the cache by hand: the server is the only
    // authority on what the task actually holds, and a hand-patched cache is
    // how an optimistic UI starts lying after a partial failure.
    onSettled: () => { void client.invalidateQueries({ queryKey: key }); },
  });

  return {
    selected: new Set(task.data?.images.map((image) => image.cloudAssetId) ?? []),
    isPending: mutation.isPending,
    error: mutation.error,
    add: (cloudAssetIds, selectedBecause) =>
      mutation.mutateAsync(
        selectedBecause === undefined
          ? { add: cloudAssetIds }
          : { add: cloudAssetIds, selectedBecause },
      ),
    remove: (cloudAssetIds) => mutation.mutateAsync({ remove: cloudAssetIds }),
  };
}
