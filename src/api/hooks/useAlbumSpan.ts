import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiDeleteWithBody, apiPut, type ApiError } from '../client';
import {
  AlbumSpanUpdateResultSchema, type AlbumSpanPutInput, type AlbumSpanUpdateResult,
} from '../contract/ref';

export interface AlbumSpanEditor {
  readonly isPending: boolean;
  readonly error: ApiError | null;
  readonly save: (input: AlbumSpanPutInput) => Promise<AlbumSpanUpdateResult>;
  /** Back to presumed — contract §4.8's DELETE. */
  readonly clear: (albumPath: string) => Promise<AlbumSpanUpdateResult>;
}

/**
 * Contract §4.8: PUT/DELETE /ref/album-span, the settings screen's highest
 * yield — 25 entries correct the interval of 421 photos. The cascade is
 * recomputed for this ONE album, synchronously, in the same transaction;
 * `/albums` is invalidated so the list reflects it without a manual refetch.
 */
export function useAlbumSpan(): AlbumSpanEditor {
  const client = useQueryClient();
  const invalidate = (): Promise<void> => client.invalidateQueries({ queryKey: ['albums'] });

  const put = useMutation<AlbumSpanUpdateResult, ApiError, AlbumSpanPutInput>({
    mutationFn: (input) => apiPut('/ref/album-span', input, AlbumSpanUpdateResultSchema),
    onSuccess: () => { void invalidate(); },
  });

  const del = useMutation<AlbumSpanUpdateResult, ApiError, string>({
    mutationFn: (albumPath) =>
      apiDeleteWithBody('/ref/album-span', { albumPath }, AlbumSpanUpdateResultSchema),
    onSuccess: () => { void invalidate(); },
  });

  return {
    isPending: put.isPending || del.isPending,
    error: put.error ?? del.error,
    save: (input) => put.mutateAsync(input),
    clear: (albumPath) => del.mutateAsync(albumPath),
  };
}
