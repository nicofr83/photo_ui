import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { apiDeleteWithBody, apiGet, apiPut, type ApiError } from '../client';
import {
  WebDocumentListSchema, type WebSpanPutInput,
} from '../contract/ref';
import { TextDocumentSchema, type TextDocument } from '../contract/text';
import { WebDocumentScope } from '../../shared/enums';

type WebDocumentList = z.infer<typeof WebDocumentListSchema>;

/**
 * Contract §4.8: the document's path is the only date hint — presented as
 * one. `scope` (v1.5, Task 12): `perimeter` (default) excludes rebuts —
 * empty templates, the Google-verification file, anything outside 1998-2004
 * — never named by a hardcoded list, which would go stale on the next
 * reimport (contract).
 */
export function useWebDocuments(
  scope: WebDocumentScope = WebDocumentScope.PERIMETER,
): UseQueryResult<WebDocumentList> {
  return useQuery({
    queryKey: ['ref', 'web-documents', scope],
    queryFn: ({ signal }) =>
      apiGet(`/ref/web-documents?scope=${scope}`, WebDocumentListSchema, signal),
  });
}

export interface WebSpanEditor {
  readonly isPending: boolean;
  readonly error: ApiError | null;
  readonly save: (input: WebSpanPutInput) => Promise<TextDocument>;
  readonly clear: (documentId: string) => Promise<TextDocument>;
}

/**
 * A `web_span` is always `kind: 'inference'` (contract §4.8) — it FILLS A
 * VOID (none of the 569 web passages carries a date), never arbitrates
 * between two sources the way a dating annotation does. `source: 'web_span'`
 * already says a human typed it; `kind` says what it is worth. Rendered
 * amber/italic/`≈`, never violet/bold/`✓` — the frontend does not choose
 * this, `ResolvedDateSchema`'s capital-rule check enforces it at parse time.
 */
export function useWebSpan(): WebSpanEditor {
  const client = useQueryClient();
  const invalidate = (): Promise<void> =>
    client.invalidateQueries({ queryKey: ['ref', 'web-documents'] });

  const put = useMutation<TextDocument, ApiError, WebSpanPutInput>({
    mutationFn: (input) => apiPut('/ref/web-span', input, TextDocumentSchema),
    onSuccess: () => { void invalidate(); },
  });

  const del = useMutation<TextDocument, ApiError, string>({
    mutationFn: (documentId) =>
      apiDeleteWithBody('/ref/web-span', { documentId }, TextDocumentSchema),
    onSuccess: () => { void invalidate(); },
  });

  return {
    isPending: put.isPending || del.isPending,
    error: put.error ?? del.error,
    save: (input) => put.mutateAsync(input),
    clear: (documentId) => del.mutateAsync(documentId),
  };
}
