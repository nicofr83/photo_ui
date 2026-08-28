import { z } from 'zod';

import { ErrorCode } from '../../shared/enums';

/**
 * The single non-2xx body shape, contract §2.3. `details` is discriminated by
 * `code`, so naming the offending parameter is an obligation of the type rather
 * than a good intention.
 */
export const ApiErrorBodySchema = z.object({
  code: z.enum(ErrorCode),
  message: z.string(),
  details: z.unknown(),
});

export const ApiErrorEnvelopeSchema = z.object({ error: ApiErrorBodySchema });

export type ApiErrorCode = z.infer<typeof ApiErrorBodySchema>['code'];
