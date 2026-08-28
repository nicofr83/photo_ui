import { z } from 'zod';

import {
  CloudAssetIdSchema, DateArbitrationSchema, FieldMatchSchema, LocalDateTimeSchema,
  ResolvedDateSchema, ResolvedPositionSchema, Sha256Schema, TextRangeSchema,
} from './common';

/** Each field nullable independently: a city with no country exists, and vice versa. */
export const PhotoPlaceSchema = z.strictObject({
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string().nullable(),
  countryRaw: z.string().nullable(),
  sublocation: z.string().nullable(),
});

export const CaptionExcerptSchema = z.strictObject({
  text: z.string(),
  highlights: z.array(TextRangeSchema),
});

/**
 * The grid item. `strictObject` is load-bearing twice over: it refuses
 * `photos.id` (spec §9.6.7) and it refuses any field the backend adds without
 * the contract being updated first, which is the drift detector.
 */
export const PhotoListItemSchema = z.strictObject({
  cloudAssetId: CloudAssetIdSchema,
  sha256: Sha256Schema,

  date: ResolvedDateSchema.nullable(),
  arbitration: DateArbitrationSchema.nullable(),
  /** The pipeline's own vocabulary, deliberately an OPEN string. */
  rawDateSource: z.string(),
  captureDateLocal: LocalDateTimeSchema.nullable(),
  captureOffsetMin: z.number().int().nullable(),
  captureDateRaw: z.string().nullable(),

  position: ResolvedPositionSchema.nullable(),
  place: PhotoPlaceSchema,

  albumPath: z.string().nullable(),
  groupName: z.string().nullable(),
  fileName: z.string(),
  format: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  aestheticsScore: z.number().nullable(),
  people: z.array(z.string()),

  /** Information, not prohibition. */
  inTaskSlugs: z.array(z.string()),
  /** Which field answered. "We cast wide, we do not tell wide." */
  matchedOn: z.array(FieldMatchSchema),

  hasCaption: z.boolean(),
  captionExcerpt: CaptionExcerptSchema.nullable(),

  thumbUrl: z.string(),
  renderUrl: z.string(),
});
export type PhotoListItem = z.infer<typeof PhotoListItemSchema>;

export const AppliedFilterSchema = z.strictObject({
  parameter: z.string(),
  values: z.array(z.string()),
  /** True when the generous reading widened the search. */
  broadened: z.boolean(),
});

export const UnmatchedFilterValueSchema = z.strictObject({
  parameter: z.string(),
  value: z.string(),
  nearest: z.array(z.string()),
});

export const FilterReportSchema = z.strictObject({
  applied: z.array(AppliedFilterSchema),
  unmatchedValues: z.array(UnmatchedFilterValueSchema),
});

/**
 * The envelope of every filtered list.
 * `total` is the filter's count, `items.length` is the transport's — spec
 * §9.6.8. `excludedCount` is required, never optional: §7.3 makes displaying
 * what was set aside an invariant, and an optional field would let it vanish.
 */
export function ListEnvelopeSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({
    items: z.array(item),
    total: z.number().int(),
    populationTotal: z.number().int(),
    excludedCount: z.number().int(),
    filters: FilterReportSchema,
    importId: z.string(),
  });
}
