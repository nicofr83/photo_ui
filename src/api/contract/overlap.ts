import { z } from 'zod';

import { OverlapRule } from '../../shared/enums';

import { PhotoListItemSchema } from './photo';
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
