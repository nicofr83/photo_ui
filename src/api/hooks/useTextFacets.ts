import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../client';
import { TextFacetsSchema, type TextFacets } from '../contract/text';

/**
 * Contract, back's Task 13: what a source actually contains — not filtered
 * by the current selection, unlike `usePhotoFacets`. `documentId === null`
 * is a deliberately unused case here: the web source has no single document
 * to ask, so `TextFilterPanel` never calls this hook for it (spec: the date
 * block is disabled outright on the web source).
 */
export function useTextFacets(documentId: string): UseQueryResult<TextFacets> {
  return useQuery({
    queryKey: ['texts', 'facets', documentId],
    queryFn: ({ signal }) =>
      apiGet(`/texts/facets?documentId=${encodeURIComponent(documentId)}`, TextFacetsSchema, signal),
  });
}
