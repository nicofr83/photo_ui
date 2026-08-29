import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { apiGet } from '../client';
import { ListEnvelopeSchema, PhotoListItemSchema } from '../contract/photo';

const PhotoPageSchema = ListEnvelopeSchema(PhotoListItemSchema);
export type PhotoPage = z.infer<typeof PhotoPageSchema>;

export function usePhotos(params: URLSearchParams): UseQueryResult<PhotoPage> {
  const query = params.toString();
  return useQuery({
    queryKey: ['photos', query],
    queryFn: ({ signal }) =>
      apiGet(`/photos${query === '' ? '' : `?${query}`}`, PhotoPageSchema, signal),
  });
}
