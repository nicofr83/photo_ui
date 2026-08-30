import { z } from 'zod';

import { expectedKindFor, expectedKindForPosition, isKindConsistent } from '../../domain/dateKind';
import { isIsoDate, isIsoTimestamp, isLocalDateTime } from '../../shared/date_interface';
import {
  DateKind, DatePrecision, DateSource, MatchField, PositionSource,
} from '../../shared/enums';

/**
 * A civil day — and a day the calendar actually has. Format alone is not
 * enough: a month-end bound computed wrong produces `1999-02-30`, which looks
 * like a date and is not one.
 */
export const IsoDateSchema = z
  .string()
  .refine(isIsoDate, 'expected a real civil day YYYY-MM-DD, with no time and no zone');

/** A real instant. Always zoned — an unzoned one would silently be read as local. */
export const IsoTimestampSchema = z
  .string()
  .refine(isIsoTimestamp, 'expected an ISO-8601 instant carrying its zone');

/**
 * A naive local timestamp, deliberately unzoned: 76 % of upstream `captureDate`
 * values carry no zone, and the file path on disk derives from the time as
 * stored. Attaching a zone here would be an assertion nobody made.
 */
export const LocalDateTimeSchema = z
  .string()
  .refine(isLocalDateTime, 'expected YYYY-MM-DDTHH:MM[:SS], unzoned');

export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
export const CloudAssetIdSchema = z.string().regex(/^[0-9a-f]{32}$/);

/**
 * The capital rule, enforced at the API boundary rather than at render time.
 * A date whose `kind` contradicts its `source` never becomes a JavaScript
 * object at all — so no component can be handed one.
 */
export const ResolvedDateSchema = z
  .strictObject({
    start: IsoDateSchema,
    end: IsoDateSchema,
    precision: z.enum(DatePrecision),
    kind: z.enum(DateKind),
    source: z.enum(DateSource),
    bracketHours: z.number().nullable(),
  })
  .superRefine((date, ctx) => {
    // superRefine, not refine: Zod 4 ignores a function passed as refine's
    // second argument, which silently collapsed these to "Invalid input" with
    // no path — useless for the drift detection this exists for.
    if (!isKindConsistent(date.source, date.kind)) {
      const expected = expectedKindFor(date.source);
      const expectedLabel = typeof expected === 'string' ? expected : expected.join(' or a ');
      ctx.addIssue({
        code: 'custom',
        path: ['kind'],
        message: `"${date.source}" is a ${expectedLabel}, but the server called it a ${date.kind}`,
      });
    }

    // Both bounds always travel, but an interval must be one.
    if (date.end < date.start) {
      ctx.addIssue({
        code: 'custom',
        path: ['end'],
        message: `interval ends before it starts: ${date.start}..${date.end}`,
      });
    }

    // Contract §2.2: the bracket belongs to the rank-3 proposal and is NULL
    // everywhere else. A bracket on a reading would render a confidence that
    // nothing supports.
    if (date.bracketHours !== null && date.source !== DateSource.LOGBOOK_BRACKET) {
      ctx.addIssue({
        code: 'custom',
        path: ['bracketHours'],
        message: `only a logbook proposal carries a bracket, not "${date.source}"`,
      });
    }
  });

/** A position, with its nature. Same rule as a date, same enforcement. */
export const ResolvedPositionSchema = z
  .strictObject({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    kind: z.enum(DateKind),
    source: z.enum(PositionSource),
  })
  .superRefine((position, ctx) => {
    const expected = expectedKindForPosition(position.source);
    if (expected !== position.kind) {
      ctx.addIssue({
        code: 'custom',
        path: ['kind'],
        message:
          `"${position.source}" is a ${expected}, but the server called it a ${position.kind}`,
      });
    }
  });

export const DateArbitrationSchema = z.strictObject({
  exifDate: LocalDateTimeSchema,
  gapMonths: z.number().int(),
  outcome: z.enum(['accepted', 'rejected']),
});

/** What the user ASKS (a filter) or DECLARES (a task's period). Not an assertion. */
export const CivilDayRangeSchema = z
  .strictObject({ from: IsoDateSchema, to: IsoDateSchema })
  .superRefine((range, ctx) => {
    if (range.to < range.from) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `range ends before it starts: ${range.from}..${range.to}`,
      });
    }
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
