import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPost, type ApiError } from '../client';
import {
  TaskDetailSchema, TaskImagesMutationResultSchema,
  type TaskImageSelection, type TaskImagesMutationResult,
} from '../contract/task';
import { SelectionReason } from '../../shared/enums';

/**
 * `server/src/http/tasks_controller.ts#parseImageAddItem`: each element MUST
 * be `{ cloudAssetId, selectedBecause }` — a bare id is refused with a named
 * 400, never treated as one. `selectedBecause` travels PER ITEM, not once
 * for the whole batch, even though every caller here applies the same
 * reasons to a whole gesture.
 */
interface ImageAddItem {
  readonly cloudAssetId: string;
  readonly selectedBecause: readonly SelectionReason[];
}

interface Mutation {
  readonly add?: readonly ImageAddItem[];
  readonly remove?: readonly string[];
  readonly update?: ReadonlyArray<{ readonly cloudAssetId: string; readonly order: number }>;
}

export interface Selection {
  readonly selected: ReadonlySet<string>;
  /** Manifest order, spec §5.6/Q6 — chronological by default, reorderable. */
  readonly images: readonly TaskImageSelection[];
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
  /**
   * Swaps this image's manifest `order` with its neighbour's, in ONE request
   * (contract §4.5's `update`) — never two, which would let the pair be
   * observed half-swapped by another reader.
   */
  readonly moveUp: (cloudAssetId: string) => Promise<TaskImagesMutationResult> | undefined;
  readonly moveDown: (cloudAssetId: string) => Promise<TaskImagesMutationResult> | undefined;
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

  const images = task.data?.images ?? [];
  const sorted = [...images].sort((a, b) => a.order - b.order);

  const swapWithNeighbour = (
    cloudAssetId: string,
    neighbourOffset: -1 | 1,
  ): Promise<TaskImagesMutationResult> | undefined => {
    const index = sorted.findIndex((i) => i.cloudAssetId === cloudAssetId);
    const neighbour = sorted[index + neighbourOffset];
    const current = sorted[index];
    if (current === undefined || neighbour === undefined) return undefined;
    return mutation.mutateAsync({
      update: [
        { cloudAssetId: current.cloudAssetId, order: neighbour.order },
        { cloudAssetId: neighbour.cloudAssetId, order: current.order },
      ],
    });
  };

  return {
    selected: new Set(images.map((image) => image.cloudAssetId)),
    images: sorted,
    isPending: mutation.isPending,
    error: mutation.error,
    add: (cloudAssetIds, selectedBecause) =>
      mutation.mutateAsync(
        {
          add: cloudAssetIds.map((cloudAssetId) => ({
            cloudAssetId,
            selectedBecause: selectedBecause ?? [SelectionReason.MANUAL],
          })),
        },
      ),
    remove: (cloudAssetIds) => mutation.mutateAsync({ remove: cloudAssetIds }),
    moveUp: (cloudAssetId) => swapWithNeighbour(cloudAssetId, -1),
    moveDown: (cloudAssetId) => swapWithNeighbour(cloudAssetId, 1),
  };
}
