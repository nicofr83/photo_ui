import { z } from 'zod';

import { IsoTimestampSchema } from './common';

export const JobStateSchema = z.enum([
  'queued', 'running', 'succeeded', 'failed', 'cancelled',
]);

export const JobTypeSchema = z.enum(['import', 'export', 'prerender', 'caption', 'dating_export']);

/**
 * Contract §7.4 (`server/src/contract/task_interface.ts:129`). `skippedImages`
 * — an image that would not render. The export CONTINUES; the image is
 * absent from the folder AND from the manifest, and is named here with its
 * cause — a manifest referencing a missing file is worse than an incomplete
 * one. No `fileName`: only `cloudAssetId` is guaranteed (a photo not on disk
 * may have none to give).
 */
export const TaskExportReportSchema = z.strictObject({
  directory: z.string(),
  manifestPath: z.string(),
  imagesWritten: z.number().int(),
  pagesWritten: z.number().int(),
  textsWritten: z.number().int(),
  notesWritten: z.number().int(),
  bytesWritten: z.number().int(),
  skippedImages: z.array(
    z.strictObject({
      cloudAssetId: z.string(),
      reason: z.enum(['SOURCE_FILE_MISSING', 'NOT_RENDERABLE', 'VOLUME_UNAVAILABLE']),
      expectedPath: z.string().nullable(),
    }),
  ),
  /** Disk full mid-export: stop, report, name the directory as partial. */
  partial: z.boolean(),
  exportedAt: IsoTimestampSchema,
});
export type TaskExportReport = z.infer<typeof TaskExportReportSchema>;

/**
 * A long operation. Polled, not streamed (`GET /jobs/:id`): the longest job
 * is a 200-image export at four seconds, so a poll every 250 ms costs
 * sixteen local requests, against a whole transport mechanism to build and
 * test. `POST /tasks/:slug/export` answers 202 with this shape already —
 * never terminal by the time the client sees it, so a caller MUST poll
 * rather than read `result`/`error` off the mutation response directly
 * (`useJob`, not `useExport` alone).
 *
 * `result` is `unknown` server-side (`server/src/metier/jobs/job_service.ts`)
 * because it varies by `type` — this app only ever submits/polls EXPORT
 * jobs today, so it is modeled precisely for that one case, same discipline
 * as everywhere else in this contract. A future job-list screen covering
 * import/prerender/caption/dating_export would need to widen this to a real
 * discriminated union, not loosen it to `z.unknown()`.
 */
export const JobSchema = z.strictObject({
  id: z.string(),
  type: JobTypeSchema,
  state: JobStateSchema,
  createdAt: IsoTimestampSchema,
  startedAt: IsoTimestampSchema.nullable(),
  finishedAt: IsoTimestampSchema.nullable(),
  progress: z.strictObject({
    done: z.number().int(),
    /** `null` until the total is known — never `0`, which would read as "done". */
    total: z.number().int().nullable(),
    label: z.string().nullable(),
  }),
  cancellable: z.boolean(),
  result: z.strictObject({ type: z.literal('export'), report: TaskExportReportSchema }).nullable(),
  /**
   * `AppError.code`/`AppError.status` from inside the job runner — e.g. a
   * `TARGET_DIRECTORY_EXISTS` — SHOULD reach here verbatim; as of this
   * writing `server/src/metier/jobs/job_service.ts:110` flattens every
   * runner failure to `{ code: 'INTERNAL' }` regardless of the thrown
   * error's real code, reported to `back`. Modeled as the intended shape
   * anyway — the fix belongs there, not in a looser schema here.
   */
  error: z.strictObject({ code: z.string(), message: z.string() }).nullable(),
});
export type Job = z.infer<typeof JobSchema>;

export const ExportInputSchema = z.strictObject({
  overwrite: z.boolean(),
});
