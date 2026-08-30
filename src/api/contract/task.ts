import { z } from 'zod';

import { SelectionReason, TaskState } from '../../shared/enums';

import { CivilDayRangeSchema, CloudAssetIdSchema, IsoTimestampSchema } from './common';
import { TextRefSchema } from './text';

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
  /**
   * The photo's date falls outside the task's declared period. Task 26
   * (`server`): counted by `warnings.imagesOutOfPeriod` AND carried here
   * per item, same shape as `orphaned` — the count and the per-image flag
   * must never be able to disagree with each other.
   */
  outOfPeriod: z.boolean(),
});
export type TaskImageSelection = z.infer<typeof TaskImageSelectionSchema>;

/** Q2, default (a): the whole passage, never an excerpt — nullable so (b)
 * would not migrate anything if it is ever revisited. */
export const TaskTextSelectionSchema = z.strictObject({
  ref: TextRefSchema,
  order: z.number().int(),
  selectedAt: IsoTimestampSchema,
  orphaned: z.boolean(),
  startOffset: z.number().int().nullable(),
  endOffset: z.number().int().nullable(),
});
export type TaskTextSelection = z.infer<typeof TaskTextSelectionSchema>;

/**
 * Spec §5.5: a free note, per task. `attachedTo` empty on both sides is a
 * GENERAL note — a common case, never an error state ("celle-ci est floue",
 * true of the whole task, not one photo or passage).
 */
export const TaskNoteSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
  attachedTo: z.strictObject({
    images: z.array(CloudAssetIdSchema),
    texts: z.array(TextRefSchema),
  }),
});
export type TaskNote = z.infer<typeof TaskNoteSchema>;

export const TaskNoteCreateInputSchema = z.strictObject({
  title: z.string(),
  text: z.string(),
  attachedTo: z.strictObject({
    images: z.array(CloudAssetIdSchema),
    texts: z.array(TextRefSchema),
  }),
});
export type TaskNoteCreateInput = z.infer<typeof TaskNoteCreateInputSchema>;

export const TaskNotePatchInputSchema = z.strictObject({
  title: z.string().optional(),
  text: z.string().optional(),
});
export type TaskNotePatchInput = z.infer<typeof TaskNotePatchInputSchema>;

export const TaskDetailSchema = TaskSummarySchema.extend({
  brief: z.string(),
  images: z.array(TaskImageSelectionSchema),
  texts: z.array(TaskTextSelectionSchema),
  notes: z.array(TaskNoteSchema),
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
 * gesture, not 286 requests (spec §9.3). Never wired into `apiPost` (which
 * only validates RESPONSES, never outgoing bodies) until a real bug — a
 * bare id in `add[]`, `useSelection.ts` sent `add: string[]` for a long
 * time — reached Nicolas in production. `server/src/http/tasks_controller
 * .ts#parseImageAddItem` refuses anything but `{ cloudAssetId,
 * selectedBecause }` PER ITEM; this schema previously modeled the wrong
 * shape (a bare id array, one shared `selectedBecause`) and nothing ever
 * checked it against reality. Now used by the mock (`mocks/handlers.ts`) to
 * refuse the same malformed shape the real server would, so MSW can no
 * longer agree with a broken client.
 */
export const TaskImageAddItemSchema = z.strictObject({
  cloudAssetId: CloudAssetIdSchema,
  selectedBecause: z.array(z.enum(SelectionReason)),
  note: z.string().optional(),
});
export const TaskImagesMutationSchema = z.strictObject({
  add: z.array(TaskImageAddItemSchema).optional(),
  remove: z.array(CloudAssetIdSchema).optional(),
  update: z.array(z.strictObject({
    cloudAssetId: CloudAssetIdSchema,
    order: z.number().int().optional(),
    note: z.string().nullable().optional(),
  })).optional(),
});

/**
 * Accepted-with-a-reservation and refused are two different renderings, so they
 * are two different fields. `merged` counts set-union no-ops: re-adding a photo
 * already held is an idempotent success, never a rejection.
 *
 * `added`/`merged`/`removed`/`updated` are COUNTS, not the id arrays this
 * schema modeled for a long time (`server/src/contract/task_interface.ts`) —
 * a mismatch nothing ever caught, since this app never read these fields
 * back, only passed the result through. `implicitlyAdded`/`contentHash`/
 * `state` were entirely absent here.
 */
export const TaskImagesMutationResultSchema = z.strictObject({
  added: z.number().int(),
  merged: z.number().int(),
  removed: z.number().int(),
  updated: z.number().int(),
  /** Selected IMPLICITLY by an `update` — writing a note retains the photo, never in silence. */
  implicitlyAdded: z.array(CloudAssetIdSchema),
  rejected: z.array(
    z.strictObject({ cloudAssetId: CloudAssetIdSchema, reason: z.enum(['unknown_photo', 'not_selected']) }),
  ),
  warnings: z.array(
    z.strictObject({
      cloudAssetId: CloudAssetIdSchema,
      code: z.enum(['out_of_period', 'orphaned']),
    }),
  ),
  imageCount: z.number().int(),
  contentHash: z.string(),
  state: z.enum(TaskState),
});
export type TaskImagesMutationResult = z.infer<typeof TaskImagesMutationResultSchema>;

export const TaskTextsMutationSchema = z.strictObject({
  add: z.array(TextRefSchema).optional(),
  remove: z.array(TextRefSchema).optional(),
  reorder: z.array(z.strictObject({ ref: TextRefSchema, order: z.number().int() })).optional(),
});
export type TaskTextsMutation = z.infer<typeof TaskTextsMutationSchema>;

/**
 * `added`/`removed` are COUNTS (`server/src/contract/task_interface.ts`),
 * same shape drift as `TaskImagesMutationResultSchema` above and same fix —
 * this app never read these two fields back either.
 */
export const TaskTextsMutationResultSchema = z.strictObject({
  added: z.number().int(),
  removed: z.number().int(),
  rejected: z.array(z.strictObject({ ref: TextRefSchema, reason: z.enum(['unknown_text', 'not_selected']) })),
  textCount: z.number().int(),
  contentHash: z.string(),
});
export type TaskTextsMutationResult = z.infer<typeof TaskTextsMutationResultSchema>;

export const TaskDuplicateInputSchema = z.strictObject({ title: z.string(), slug: z.string() });

export const TaskDeleteResultSchema = z.strictObject({
  deleted: z.boolean(),
  /** DELETE never touches an already-exported folder. Named so the
   * confirmation can say so. */
  exportDirectoryKept: z.string().nullable(),
});
export type TaskDeleteResult = z.infer<typeof TaskDeleteResultSchema>;
