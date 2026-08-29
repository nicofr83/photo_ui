import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../client';
import { TextOverlapEnvelopeSchema, type TextOverlapEnvelope } from '../contract/overlap';

/**
 * Contract §4.2: "quels textes couvrent cette photo ?" — the reverse of the
 * axis TextsScreen opens (`overlapsTextKind`/`overlapsTextId` on `/photos`).
 * Same predicate, same `OverlapInfo` shape, the other direction.
 */
export function useOverlappingTexts(cloudAssetId: string): UseQueryResult<TextOverlapEnvelope> {
  return useQuery({
    queryKey: ['photo', cloudAssetId, 'texts'],
    queryFn: ({ signal }) =>
      apiGet(`/photos/${cloudAssetId}/texts`, TextOverlapEnvelopeSchema, signal),
  });
}
