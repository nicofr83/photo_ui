import { z } from 'zod';

import { DateKind, DatePrecision } from '../../shared/enums';

import { IsoDateSchema } from './common';
import { PhotoListItemSchema } from './photo';
import { TaskImageSelectionSchema, TaskNoteSchema, TaskSummarySchema, TaskTextSelectionSchema } from './task';
import { TextUnitSchema } from './text';

/**
 * `GET /tasks/:slug/review` (contract §7.3, "tranché avec `impl-frontend`"):
 * the chronology is layout and is derived client-side from ResolvedDate
 * bounds — never flattened to one point — but the EIGHT counters of the
 * control banner are NOT: `imagesWithoutText` applies the recouvrement
 * predicate, and duplicating that client-side would risk contradicting
 * `GET /photos?overlapsText…` — a number that disagrees with the rest of
 * the app is worse than one more endpoint.
 */
export const TaskReviewSchema = z.strictObject({
  task: TaskSummarySchema,
  images: z.array(PhotoListItemSchema.extend({ selection: TaskImageSelectionSchema })),
  texts: z.array(TextUnitSchema.extend({ selection: TaskTextSelectionSchema })),
  notes: z.array(TaskNoteSchema),
  /** Each count is clickable client-side — spec §5.6. */
  warnings: z.strictObject({
    undatedImages: z.number().int(),
    inferredDateImages: z.number().int(),
    uncertainTexts: z.number().int(),
    textsWiderThan30Days: z.number().int(),
    imagesWithoutText: z.number().int(),
    orphanedImages: z.number().int(),
    orphanedTexts: z.number().int(),
    imagesOutOfPeriod: z.number().int(),
  }),
  timeline: z.array(z.strictObject({
    kind: z.enum(['image', 'text']),
    id: z.string(),
    start: IsoDateSchema,
    end: IsoDateSchema,
    precision: z.enum(DatePrecision),
    dateKind: z.enum(DateKind),
  })),
});
export type TaskReview = z.infer<typeof TaskReviewSchema>;
export type TaskReviewWarnings = TaskReview['warnings'];
export type TaskReviewTimelineEntry = TaskReview['timeline'][number];
