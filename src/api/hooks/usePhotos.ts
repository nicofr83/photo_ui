import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { apiGet } from '../client';
import { PhotoOverlapEnvelopeSchema, type PhotoOverlapEnvelope } from '../contract/overlap';
import { ListEnvelopeSchema, PhotoListItemSchema } from '../contract/photo';

const PhotoPageSchema = ListEnvelopeSchema(PhotoListItemSchema);
export type PhotoPage = z.infer<typeof PhotoPageSchema>;

export function usePhotos(
  params: URLSearchParams,
): UseQueryResult<PhotoPage | PhotoOverlapEnvelope> {
  const query = params.toString();

  // Contract §4.2: `overlap` on every item and `overlapSummary` in the
  // envelope are added TOGETHER, only when both overlap parameters are
  // present — a different response shape, not a null placeholder on the
  // plain one. `strictObject` on either schema would refuse the other's
  // response, so the client has to know which one it asked for.
  const withOverlap = params.has('overlapsTextKind') && params.has('overlapsTextId');
  const schema = withOverlap ? PhotoOverlapEnvelopeSchema : PhotoPageSchema;

  return useQuery({
    queryKey: ['photos', query],
    queryFn: ({ signal }) =>
      apiGet(`/photos${query === '' ? '' : `?${query}`}`, schema, signal),
  });
}
