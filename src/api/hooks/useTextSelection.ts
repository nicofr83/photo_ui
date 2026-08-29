import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPost, type ApiError } from '../client';
import {
  TaskDetailSchema, TaskTextsMutationResultSchema,
  type TaskTextsMutationResult,
} from '../contract/task';
import type { TextRef } from '../contract/text';

export interface TextSelection {
  readonly selected: ReadonlySet<string>;
  readonly isPending: boolean;
  readonly error: ApiError | null;
  readonly add: (refs: readonly TextRef[]) => Promise<TaskTextsMutationResult>;
  readonly remove: (refs: readonly TextRef[]) => Promise<TaskTextsMutationResult>;
}

const key = (ref: TextRef): string => `${ref.kind}:${ref.id}`;

/**
 * Contract §4.5's `POST /tasks/:slug/texts` — the text equivalent of
 * `useSelection` for images. Q2 default (a): the whole passage, never an
 * excerpt (`startOffset`/`endOffset` stay null here).
 */
export function useTextSelection(slug: string): TextSelection {
  const client = useQueryClient();
  const taskKey = ['task', slug];

  const task = useQuery({
    queryKey: taskKey,
    queryFn: ({ signal }) => apiGet(`/tasks/${slug}`, TaskDetailSchema, signal),
  });

  const mutation = useMutation<
    TaskTextsMutationResult, ApiError, { add?: TextRef[]; remove?: TextRef[] }
  >({
    mutationFn: (body) => apiPost(`/tasks/${slug}/texts`, body, TaskTextsMutationResultSchema),
    onSettled: () => { void client.invalidateQueries({ queryKey: taskKey }); },
  });

  return {
    selected: new Set((task.data?.texts ?? []).map((t) => key(t.ref))),
    isPending: mutation.isPending,
    error: mutation.error,
    add: (refs) => mutation.mutateAsync({ add: [...refs] }),
    remove: (refs) => mutation.mutateAsync({ remove: [...refs] }),
  };
}
