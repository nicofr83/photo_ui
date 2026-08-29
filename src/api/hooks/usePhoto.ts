import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../client';
import { PhotoDetailSchema, type PhotoDetail } from '../contract/photo';

export function usePhoto(cloudAssetId: string): UseQueryResult<PhotoDetail> {
  return useQuery({
    queryKey: ['photo', cloudAssetId],
    queryFn: ({ signal }) => apiGet(`/photos/${cloudAssetId}`, PhotoDetailSchema, signal),
  });
}
