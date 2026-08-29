import { z } from 'zod';

import { IsoDateSchema } from './common';

/** The interval the cascade actually uses for an album. Contract §2.5. */
export const AlbumSpanSchema = z.strictObject({
  from: IsoDateSchema,
  to: IsoDateSchema,
  /** false = typed into ref.album_span · true = derived from the prefix, to revisit. */
  presumed: z.boolean(),
  note: z.string().nullable(),
});

/**
 * The two hints of the span-entry screen. Presented AS HINTS and never
 * pre-filled into the inputs: they are exactly the data the arbitration judged
 * unreliable.
 */
export const AlbumSpanHintsSchema = z.strictObject({
  fileNamePatterns: z.array(z.string()),
  rejectedExifRange: z.strictObject({ from: IsoDateSchema, to: IsoDateSchema }).nullable(),
  rejectedExifCount: z.number().int(),
});

export const AlbumSchema = z.strictObject({
  path: z.string(),
  setName: z.string().nullable(),
  albumName: z.string(),
  groupName: z.string().nullable(),
  photoCount: z.number().int(),
  /** What the PREFIX gives. Never presented to the user as a date. Spec §3.2. */
  prefixYear: z.number().int().nullable(),
  prefixMonth: z.number().int().nullable(),
  span: AlbumSpanSchema,
  /** The name announces a duration or a journey — 25 albums, 1 268 photos. */
  suspectedRange: z.boolean(),
  hints: AlbumSpanHintsSchema,
});
export type Album = z.infer<typeof AlbumSchema>;

export const AlbumListSchema = z.strictObject({ items: z.array(AlbumSchema) });
