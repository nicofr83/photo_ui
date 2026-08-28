import { z } from 'zod';

import { expectedKindFor } from '../../domain/dateKind';
import {
  DateKind, DatePrecision, DateSource, MatchField, PositionSource,
} from '../../shared/enums';

export const IsoDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a civil day YYYY-MM-DD, with no time and no zone');

/** A naive local timestamp. Never converted, never given a zone. */
export const LocalDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/, 'expected YYYY-MM-DDTHH:MM[:SS]');

export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
export const CloudAssetIdSchema = z.string().regex(/^[0-9a-f]{32}$/);

/**
 * The capital rule, enforced at the API boundary rather than at render time.
 * A date whose `kind` contradicts its `source` never becomes a JavaScript
 * object at all — so no component can be handed one.
 */
export const ResolvedDateSchema = z
  .strictObject({
    start: IsoDaySchema,
    end: IsoDaySchema,
    precision: z.enum(DatePrecision),
    kind: z.enum(DateKind),
    source: z.enum(DateSource),
    bracketHours: z.number().nullable(),
  })
  .superRefine((date, ctx) => {
    // superRefine, not refine: Zod 4 ignores a function passed as refine's
    // second argument, which silently collapsed this to "Invalid input" with no
    // path — useless for the drift detection this exists for.
    const expected = expectedKindFor(date.source);
    if (expected !== date.kind) {
      ctx.addIssue({
        code: 'custom',
        path: ['kind'],
        message:
          `"${date.source}" is a ${expected}, but the server called it a ${date.kind}`,
      });
    }
  });

export const ResolvedPositionSchema = z.strictObject({
  lat: z.number(),
  lon: z.number(),
  kind: z.enum(DateKind),
  source: z.enum(PositionSource),
});

export const DateArbitrationSchema = z.strictObject({
  exifDate: LocalDateTimeSchema,
  gapMonths: z.number().int(),
  outcome: z.enum(['accepted', 'rejected']),
});

export const FieldMatchSchema = z.strictObject({
  field: z.enum(MatchField),
  value: z.string(),
});

/** Offsets in UTF-16 units — JavaScript semantics. */
export const TextRangeSchema = z.strictObject({
  start: z.number().int(),
  length: z.number().int(),
});
