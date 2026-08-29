import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { apiGet } from '../client';
import { TextPageListSchema } from '../contract/text';

type PageList = z.infer<typeof TextPageListSchema>;

/**
 * Contract §4.3. Small per document (≤ 104 pages, "Ma vie") — loaded whole,
 * same reasoning as `useTexts`: no per-page round trip while browsing.
 */
export function usePages(documentId: string): UseQueryResult<PageList> {
  return useQuery({
    queryKey: ['pages', documentId],
    queryFn: ({ signal }) =>
      apiGet(`/pages?documentId=${encodeURIComponent(documentId)}`, TextPageListSchema, signal),
  });
}
