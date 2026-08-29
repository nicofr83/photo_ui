import { z } from 'zod';

import { AlbumSchema } from './album';
import { IsoDateSchema, ResolvedDateSchema } from './common';

/**
 * Contract §4.8, écran « Réglages » — the three referentials that only
 * exist because a person fills them: 25 album-span entries correct the
 * interval of 421 photos.
 */
export const AlbumSpanWarningSchema = z.discriminatedUnion('code', [
  z.strictObject({
    code: z.literal('outside_prefix_year'),
    prefixYear: z.number().int(),
  }),
  z.strictObject({
    code: z.literal('overlaps_album'),
    albumPath: z.string(),
  }),
]);
export type AlbumSpanWarning = z.infer<typeof AlbumSpanWarningSchema>;

export const AlbumSpanUpdateResultSchema = z.strictObject({
  album: AlbumSchema,
  /** The cascade is recomputed for THIS album only, in the transaction. */
  recomputed: z.strictObject({
    photosAffected: z.number().int(),
    datesChanged: z.number().int(),
    precisionChanged: z.number().int(),
  }),
  /** Accepted regardless. A warning is not a refusal. */
  warnings: z.array(AlbumSpanWarningSchema),
});
export type AlbumSpanUpdateResult = z.infer<typeof AlbumSpanUpdateResultSchema>;

export const AlbumSpanPutInputSchema = z.strictObject({
  albumPath: z.string(),
  dateFrom: IsoDateSchema,
  dateTo: IsoDateSchema,
  note: z.string().nullable(),
});
export type AlbumSpanPutInput = z.infer<typeof AlbumSpanPutInputSchema>;

export const AlbumSpanDeleteInputSchema = z.strictObject({ albumPath: z.string() });

export const WebDocumentRowSchema = z.strictObject({
  documentId: z.string(),
  title: z.string(),
  passageCount: z.number().int(),
  /** An excerpt to recognise the document — none of its passages are dated. */
  excerpt: z.string(),
  span: ResolvedDateSchema.nullable(),
  /** The document's PATH is the only date hint. Presented as exactly that. */
  pathHint: z.string(),
});
export type WebDocumentRow = z.infer<typeof WebDocumentRowSchema>;

export const WebDocumentListSchema = z.strictObject({ items: z.array(WebDocumentRowSchema) });

export const WebSpanPutInputSchema = z.strictObject({
  documentId: z.string(),
  dateFrom: IsoDateSchema,
  dateTo: IsoDateSchema,
  note: z.string().nullable(),
});
export type WebSpanPutInput = z.infer<typeof WebSpanPutInputSchema>;

export const WebSpanDeleteInputSchema = z.strictObject({ documentId: z.string() });
