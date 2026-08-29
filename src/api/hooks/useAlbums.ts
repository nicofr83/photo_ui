import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { apiGet } from '../client';
import { AlbumListSchema } from '../contract/album';

type AlbumList = z.infer<typeof AlbumListSchema>;

/** The 82 albums fit in one response; there is nothing to paginate. */
export function useAlbums(): UseQueryResult<AlbumList> {
  return useQuery({
    queryKey: ['albums'],
    queryFn: ({ signal }) => apiGet('/albums', AlbumListSchema, signal),
    staleTime: Infinity,
  });
}
