import { z } from 'zod';

import { OverlapRule } from '../../shared/enums';

import { ListEnvelopeSchema, PhotoListItemSchema } from './photo';
import { TextUnitSchema } from './text';

/**
 * Two INTERVALS are crossed, never a point:
 *   overlaps ⟺ photo.start ≤ text.end AND text.start ≤ photo.end
 *
 * No width cap. 40 % of photo dates are not measurements, so a threshold
 * computed on them would hide correct overlaps as readily as noise — and would
 * do it in silence. It is for a person to judge, with the figures in view.
 */
export const OverlapInfoSchema = z.strictObject({
  rule: z.enum(OverlapRule),
  /** What we DO NOT KNOW about the photo. */
  photoSpanDays: z.number().int(),
  /** What the text COVERS. */
  textSpanDays: z.number().int(),
  /** Default sort: this sum, ascending. */
  totalSpanDays: z.number().int(),
  distanceToCentreDays: z.number().int(),
});
export type OverlapInfo = z.infer<typeof OverlapInfoSchema>;

export const PhotoWithOverlapSchema = PhotoListItemSchema.extend({
  overlap: OverlapInfoSchema,
});
export type PhotoWithOverlap = z.infer<typeof PhotoWithOverlapSchema>;

export const TextWithOverlapSchema = TextUnitSchema.extend({
  overlap: OverlapInfoSchema,
});
export type TextWithOverlap = z.infer<typeof TextWithOverlapSchema>;

/**
 * "87 photos dans une fenêtre de 41 jours, dont 34 datées au mois seulement."
 * The counter is explicit so the user knows what the proposal is worth AND
 * where its weakness comes from.
 */
export const OverlapSummarySchema = z.strictObject({
  matchCount: z.number().int(),
  windowDays: z.number().int(),
  datedToDayCount: z.number().int(),
  datedToMonthCount: z.number().int(),
  datedToYearCount: z.number().int(),
  undatedCount: z.number().int(),
});
export type OverlapSummary = z.infer<typeof OverlapSummarySchema>;

/**
 * The two response shapes of contract §4.2/§4.3 when an overlap axis is
 * active — `overlap` on every item AND `overlapSummary` in the envelope, both
 * added together, never one without the other. A DIFFERENT shape from the
 * plain envelope, not a nullable placeholder on it: outside an overlap query
 * a photo or a text has no notion of "its overlap" to be null about.
 */
export const PhotoOverlapEnvelopeSchema = ListEnvelopeSchema(PhotoWithOverlapSchema).extend({
  overlapSummary: OverlapSummarySchema,
});
export type PhotoOverlapEnvelope = z.infer<typeof PhotoOverlapEnvelopeSchema>;

export const TextOverlapEnvelopeSchema = ListEnvelopeSchema(TextWithOverlapSchema).extend({
  overlapSummary: OverlapSummarySchema,
});
export type TextOverlapEnvelope = z.infer<typeof TextOverlapEnvelopeSchema>;
