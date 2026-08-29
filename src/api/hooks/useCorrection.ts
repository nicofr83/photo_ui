import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiPost, apiPut, type ApiError } from '../client';
import {
  RevertCorrectionInputSchema, TextUnitSchema,
  type TextCorrectionInput, type TextRef, type TextUnit,
} from '../contract/text';

export interface Correction {
  readonly isPending: boolean;
  readonly error: ApiError | null;
  readonly submit: (input: TextCorrectionInput) => Promise<TextUnit>;
  readonly revert: (ref: TextRef) => Promise<TextUnit>;
}

/**
 * Contract §4.4: `PUT /corrections` and `POST /corrections/revert`. Global,
 * never per task — an OCR error is wrong in every task — so any query keyed
 * on the corpus (`texts`, a photo's overlapping texts) is invalidated rather
 * than patched by hand.
 */
export function useCorrection(): Correction {
  const client = useQueryClient();
  const invalidateAll = (): Promise<void> =>
    client.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'texts' || q.queryKey[0] === 'photo' });

  const submitMutation = useMutation<TextUnit, ApiError, TextCorrectionInput>({
    mutationFn: (input) => apiPut('/corrections', input, TextUnitSchema),
    onSuccess: () => { void invalidateAll(); },
  });

  const revertMutation = useMutation<TextUnit, ApiError, TextRef>({
    mutationFn: (ref) =>
      apiPost('/corrections/revert', RevertCorrectionInputSchema.parse({ ref }), TextUnitSchema),
    onSuccess: () => { void invalidateAll(); },
  });

  return {
    isPending: submitMutation.isPending || revertMutation.isPending,
    error: submitMutation.error ?? revertMutation.error,
    // Empty/blank is refused CLIENT-SIDE by the caller disabling the control
    // (spec: "correction vide refusée") — the server's 422 EMPTY_CORRECTION
    // is the backstop, not the first line.
    submit: (input) => submitMutation.mutateAsync(input),
    revert: (ref) => revertMutation.mutateAsync(ref),
  };
}
