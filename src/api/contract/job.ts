import { z } from 'zod';

import { IsoTimestampSchema } from './common';

export const JobStateSchema = z.enum([
  'queued', 'running', 'succeeded', 'failed', 'cancelled',
]);

/**
 * A long operation. Polled, not streamed: the longest job is a 200-image export
 * at four seconds, so a poll every 250 ms costs sixteen local requests, against
 * a whole transport mechanism to build and test.
 */
export const JobSchema = z.strictObject({
  jobId: z.string(),
  type: z.enum(['import', 'export', 'prerender', 'caption', 'dating_export']),
  state: JobStateSchema,
  done: z.number().int(),
  total: z.number().int(),
  startedAt: IsoTimestampSchema,
  endedAt: IsoTimestampSchema.nullable(),
  /** Present once the job has ended. */
  report: z
    .strictObject({
      directory: z.string(),
      written: z.number().int(),
      /**
       * An image that would not render. The export CONTINUES; the image is
       * absent from the folder AND from the manifest, and is named here with
       * its cause — a manifest referencing a missing file is worse than an
       * incomplete one.
       */
      skipped: z.array(
        z.strictObject({
          cloudAssetId: z.string(),
          fileName: z.string(),
          reason: z.string(),
        }),
      ),
      partial: z.boolean(),
    })
    .nullable(),
});
export type Job = z.infer<typeof JobSchema>;

export const ExportInputSchema = z.strictObject({
  overwrite: z.boolean(),
});
