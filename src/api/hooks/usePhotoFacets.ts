import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../client';
import { PhotoFacetsSchema, type PhotoFacets } from '../contract/photo';

/**
 * Contract §5.4/§4.2: a SEPARATE call from `/photos`, deliberately — facets
 * depend on neither sort nor offset, so they are a different cache key and
 * are not repaid on every scroll. Same filter parameters as `/photos`
 * otherwise (contract's own words: "mêmes paramètres de filtre").
 */
export function usePhotoFacets(params: URLSearchParams): UseQueryResult<PhotoFacets> {
  const query = params.toString();
  return useQuery({
    queryKey: ['photos', 'facets', query],
    queryFn: ({ signal }) =>
      apiGet(`/photos/facets${query === '' ? '' : `?${query}`}`, PhotoFacetsSchema, signal),
  });
}
