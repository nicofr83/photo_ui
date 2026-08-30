import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';

import { apiGet } from '../client';
import { TextDocumentListSchema, TextUnitListSchema } from '../contract/text';
import type { TextKind } from '../../shared/enums';

type TextEnvelope = z.infer<typeof TextUnitListSchema>;
type DocumentList = z.infer<typeof TextDocumentListSchema>;

export function useDocuments(): UseQueryResult<DocumentList> {
  return useQuery({
    queryKey: ['documents'],
    queryFn: ({ signal }) => apiGet('/documents', TextDocumentListSchema, signal),
    staleTime: Infinity,
  });
}

/**
 * A whole document's texts in one call. The largest is the logbook at roughly
 * 1 500 units under 400 characters each — a few hundred kilobytes on the
 * loopback — and having them all makes navigating by page, by date or by
 * search instant and local, which is what the facing-page panel needs.
 */
export function useTexts(documentId: string): UseQueryResult<TextEnvelope> {
  return useQuery({
    queryKey: ['texts', documentId],
    queryFn: ({ signal }) =>
      apiGet(`/texts?documentId=${encodeURIComponent(documentId)}`, TextUnitListSchema, signal),
  });
}

/**
 * Cross-document, unlike `useTexts` — gallery captions belong to many
 * different web documents (one per gallery page), and the subsection they
 * render in (spec: "sous-section de la source web") is ONE list for the
 * whole web source, not one more per-document listing.
 */
export function useTextsByKind(kind: TextKind): UseQueryResult<TextEnvelope> {
  return useQuery({
    queryKey: ['texts', 'kind', kind],
    queryFn: ({ signal }) =>
      apiGet(`/texts?kind=${encodeURIComponent(kind)}`, TextUnitListSchema, signal),
  });
}
