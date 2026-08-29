import { z } from 'zod';

import { SelectionReason, TaskState } from '../../shared/enums';

import { CivilDayRangeSchema, CloudAssetIdSchema, IsoTimestampSchema } from './common';

export const TaskSummarySchema = z.strictObject({
  slug: z.string(),
  title: z.string(),
  period: CivilDayRangeSchema.nullable(),
  imageCount: z.number().int(),
  textCount: z.number().int(),
  noteCount: z.number().int(),
  /** Selections whose photo left the index. Marked, never deleted. Spec §7.4. */
  orphanCount: z.number().int(),
  state: z.enum(TaskState),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
  /** The list orders on this. */
  lastOpenedAt: IsoTimestampSchema.nullable(),
  exportedAt: IsoTimestampSchema.nullable(),
  exportDirectory: z.string().nullable(),
  /** Fingerprint of the exportable content, exported_at excluded. */
  contentHash: z.string(),
  exportedContentHash: z.string().nullable(),
});
export type TaskSummary = z.infer<typeof TaskSummarySchema>;

export const TaskImageSelectionSchema = z.strictObject({
  cloudAssetId: CloudAssetIdSchema,
  /** Manifest order — what the LLM will read. Chronological by default. */
  order: z.number().int(),
  /** The caption that will travel with this image. */
  note: z.string().nullable(),
  /** Traceability of the GESTURE, not a property of the photo. Additive. */
  selectedBecause: z.array(z.enum(SelectionReason)),
  selectedAt: IsoTimestampSchema,
  orphaned: z.boolean(),
});

export const TaskDetailSchema = TaskSummarySchema.extend({
  brief: z.string(),
  images: z.array(TaskImageSelectionSchema),
});
export type TaskDetail = z.infer<typeof TaskDetailSchema>;

export const TaskListSchema = z.strictObject({ items: z.array(TaskSummarySchema) });

export const TaskCreateInputSchema = z.strictObject({
  slug: z.string(),
  title: z.string(),
  brief: z.string(),
  period: CivilDayRangeSchema.nullable(),
});
export type TaskCreateInput = z.infer<typeof TaskCreateInputSchema>;

/**
 * A batch, never one request per photo: selecting an album of 286 photos is a
 * gesture, not 286 requests (spec §9.3).
 */
export const TaskImagesMutationSchema = z.strictObject({
  add: z.array(CloudAssetIdSchema).optional(),
  remove: z.array(CloudAssetIdSchema).optional(),
  selectedBecause: z.array(z.enum(SelectionReason)).optional(),
});

/**
 * Accepted-with-a-reservation and refused are two different renderings, so they
 * are two different fields. `merged` counts set-union no-ops: re-adding a photo
 * already held is an idempotent success, never a rejection.
 */
export const TaskImagesMutationResultSchema = z.strictObject({
  added: z.array(CloudAssetIdSchema),
  removed: z.array(CloudAssetIdSchema),
  merged: z.array(CloudAssetIdSchema),
  rejected: z.array(
    z.strictObject({ cloudAssetId: CloudAssetIdSchema, reason: z.string() }),
  ),
  warnings: z.array(
    z.strictObject({
      cloudAssetId: CloudAssetIdSchema,
      code: z.enum(['out_of_period', 'orphaned']),
    }),
  ),
  imageCount: z.number().int(),
});
export type TaskImagesMutationResult = z.infer<typeof TaskImagesMutationResultSchema>;
