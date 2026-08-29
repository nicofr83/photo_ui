import { z } from 'zod';

import { IsoTimestampSchema } from './common';

/**
 * Contract §4.1/§9: consulted at startup, polled during long operations.
 * "Une donnée périmée doit se voir" becomes concrete here.
 */
export const RootStatusSchema = z.strictObject({
  name: z.enum(['originals', 'thumbs', 'pages', 'tasks', 'render_cache']),
  envVar: z.string(),
  path: z.string(),
  available: z.boolean(),
  checkedAt: IsoTimestampSchema,
});
export type RootStatus = z.infer<typeof RootStatusSchema>;

export const SystemStatusSchema = z.strictObject({
  /** Changes on every successful import — comparing it against a list's own
   * detects an import that happened mid-session. */
  importId: z.string(),
  importedAt: IsoTimestampSchema.nullable(),
  runningJobId: z.string().nullable(),

  roots: z.array(RootStatusSchema),
  counts: z.strictObject({
    photosInHierarchy: z.number().int(),
    photosOutOfHierarchy: z.number().int(),
    albums: z.number().int(),
    documents: z.number().int(),
    passages: z.number().int(),
    logEntries: z.number().int(),
  }),
  prerender: z.strictObject({
    total: z.number().int(), done: z.number().int(), running: z.boolean(),
  }),
  /** The captioning pass. Never blocks anything — informational only. */
  captions: z.strictObject({
    total: z.number().int(), done: z.number().int(), edited: z.number().int(), running: z.boolean(),
  }),
  /**
   * What the user must see without looking for it — ONE global banner, shown
   * only when one of these counts is non-zero; the detail lives in the
   * Réglages screen and nowhere else (spec: four competing banners over the
   * grid is worse than one). The current filter's own excluded count is NOT
   * here — that travels per-request in `ListEnvelope.excludedCount`.
   */
  attention: z.strictObject({
    orphanedSelections: z.number().int(),
    correctionsNeedingReview: z.number().int(),
    correctionsOrphaned: z.number().int(),
    albumsWithPresumedSpan: z.number().int(),
    webDocumentsWithoutSpan: z.number().int(),
  }),
  features: z.strictObject({
    /** §8.1: dating-annotation export. Off by default. */
    datingExport: z.boolean(),
  }),
});
export type SystemStatus = z.infer<typeof SystemStatusSchema>;
