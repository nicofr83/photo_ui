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

/**
 * v1.5: what a proposal would apply, and what it is worth — the same
 * "worth AND weakness" reasoning as the photo/text overlap summary,
 * applied to a single undated document borrowing its DATED neighbour's day.
 */
export const WebDateProposalSchema = z.strictObject({
  date: IsoDateSchema,
  photoCount: z.number().int(),
  datedToDayCount: z.number().int(),
  spanDays: z.number().int(),
  /**
   * v1.6, A11: the earliest-dated linked photo, the same one that
   * establishes `date` — never a screenshot of the page (measured: the
   * site's 60 pages share one FrontPage template, its excerpt matches the
   * title on 45 of 60; a real photo is recognisable at a glance). Present
   * on every proposal — a document with none has `proposal: null`
   * (`WebDocumentRow`), so no thumbnail at all rather than a fabricated one.
   * Served via the existing `GET /images/:sha256/thumb`.
   */
  thumbSha256: z.string(),
});
export type WebDateProposal = z.infer<typeof WebDateProposalSchema>;

export const WebDocumentRowSchema = z.strictObject({
  documentId: z.string(),
  title: z.string(),
  passageCount: z.number().int(),
  /** An excerpt to recognise the document — none of its passages are dated. */
  excerpt: z.string(),
  span: ResolvedDateSchema.nullable(),
  /** The document's PATH is the only date hint. Presented as exactly that. */
  pathHint: z.string(),
  /** v1.5: `null` when there is no dated neighbour to propose from. */
  proposal: WebDateProposalSchema.nullable(),
});
export type WebDocumentRow = z.infer<typeof WebDocumentRowSchema>;

export const WebDocumentListSchema = z.strictObject({ items: z.array(WebDocumentRowSchema) });

/**
 * v1.5: a single START bound, never `dateTo` — the end is computed at read
 * time (the next DATED document by date, minus a day; or this document's
 * own date if it is the last). Chaining is between dated documents, by
 * date; `document_id` plays no role, and an undated document is never
 * rescued by inheritance.
 */
export const WebSpanPutInputSchema = z.strictObject({
  documentId: z.string(),
  dateFrom: IsoDateSchema,
  note: z.string().nullable(),
});
export type WebSpanPutInput = z.infer<typeof WebSpanPutInputSchema>;

export const WebSpanDeleteInputSchema = z.strictObject({ documentId: z.string() });
