import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { apiGet } from '../client';
import { TextPageListSchema } from '../contract/text';

type PageList = z.infer<typeof TextPageListSchema>;

export interface PageFilters {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly q?: string;
}

/**
 * Contract §4.3. Small per document (≤ 104 pages, "Ma vie") — loaded whole,
 * same reasoning as `useTexts`: no per-page round trip while browsing.
 *
 * Wiring (v1.5, post-plan): `dateFrom`/`dateTo`/`q` (back's Task 14) —
 * `PageDetail`/`TextCard`'s facing-page fetch and `NoteFromTextButton` call
 * this with no filters, the same `['pages', documentId]` key as before
 * (unfiltered), so they keep sharing cache with `PageList`'s own unfiltered
 * calls rather than each becoming its own request.
 */
export function usePages(documentId: string, filters: PageFilters = {}): UseQueryResult<PageList> {
  const { dateFrom, dateTo, q } = filters;
  return useQuery({
    queryKey: ['pages', documentId, dateFrom ?? null, dateTo ?? null, q ?? null],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ documentId });
      if (dateFrom !== undefined) params.set('dateFrom', dateFrom);
      if (dateTo !== undefined) params.set('dateTo', dateTo);
      if (q !== undefined && q !== '') params.set('q', q);
      return apiGet(`/pages?${params.toString()}`, TextPageListSchema, signal);
    },
  });
}
