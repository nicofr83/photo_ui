import { z } from 'zod';

import { CaptionKind } from '../../shared/enums';

import {
  CloudAssetIdSchema, DateArbitrationSchema, FieldMatchSchema, IsoDateSchema,
  IsoTimestampSchema, LocalDateTimeSchema, ResolvedDateSchema, ResolvedPositionSchema,
  Sha256Schema, TextRangeSchema,
} from './common';

/** Each field nullable independently: a city with no country exists, and vice versa. */
export const PhotoPlaceSchema = z.strictObject({
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string().nullable(),
  countryRaw: z.string().nullable(),
  sublocation: z.string().nullable(),
});

export const CaptionExcerptSchema = z.strictObject({
  text: z.string(),
  highlights: z.array(TextRangeSchema),
});

/**
 * The grid item. `strictObject` is load-bearing twice over: it refuses
 * `photos.id` (spec §9.6.7) and it refuses any field the backend adds without
 * the contract being updated first, which is the drift detector.
 */
export const PhotoListItemSchema = z.strictObject({
  cloudAssetId: CloudAssetIdSchema,
  sha256: Sha256Schema,

  date: ResolvedDateSchema.nullable(),
  arbitration: DateArbitrationSchema.nullable(),
  /** The pipeline's own vocabulary, deliberately an OPEN string. */
  rawDateSource: z.string(),
  captureDateLocal: LocalDateTimeSchema.nullable(),
  captureOffsetMin: z.number().int().nullable(),
  captureDateRaw: z.string().nullable(),

  position: ResolvedPositionSchema.nullable(),
  place: PhotoPlaceSchema,

  albumPath: z.string().nullable(),
  groupName: z.string().nullable(),
  fileName: z.string(),
  format: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  aestheticsScore: z.number().nullable(),
  people: z.array(z.string()),

  /** Information, not prohibition. */
  inTaskSlugs: z.array(z.string()),
  /** Which field answered. "We cast wide, we do not tell wide." */
  matchedOn: z.array(FieldMatchSchema),

  hasCaption: z.boolean(),
  captionExcerpt: CaptionExcerptSchema.nullable(),

  thumbUrl: z.string(),
  renderUrl: z.string(),
});
export type PhotoListItem = z.infer<typeof PhotoListItemSchema>;

export const AppliedFilterSchema = z.strictObject({
  parameter: z.string(),
  values: z.array(z.string()),
  /** True when the generous reading widened the search. */
  broadened: z.boolean(),
});

export const UnmatchedFilterValueSchema = z.strictObject({
  parameter: z.string(),
  value: z.string(),
  nearest: z.array(z.string()),
});

export const FilterReportSchema = z.strictObject({
  applied: z.array(AppliedFilterSchema),
  unmatchedValues: z.array(UnmatchedFilterValueSchema),
});

/**
 * The envelope of every filtered list.
 * `total` is the filter's count, `items.length` is the transport's — spec
 * §9.6.8. `excludedCount` is required, never optional: §7.3 makes displaying
 * what was set aside an invariant, and an optional field would let it vanish.
 */
export function ListEnvelopeSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({
    items: z.array(item),
    total: z.number().int(),
    populationTotal: z.number().int(),
    excludedCount: z.number().int(),
    filters: FilterReportSchema,
    importId: z.string(),
  });
}

/**
 * Whether the 1400 px render can be produced, and if not, WHY.
 *
 * An <img> onerror is opaque, so the JSON has to carry the reason: spec §5.2
 * requires the volume being absent (global, a configuration problem) to be
 * distinguished from this one file being missing, and from a format that
 * produces no pixels at all. Contract amendment, detail only.
 */
export const RenderAvailabilitySchema = z.strictObject({
  available: z.boolean(),
  unavailableReason: z
    .enum(['volume_unavailable', 'source_file_missing', 'not_renderable'])
    .nullable(),
  cached: z.boolean(),
});

export const PhotoTagSchema = z.strictObject({
  name: z.string(),
  /** NULL for a `user` keyword. NULL never excludes a tag. Spec §6.3. */
  confidence: z.number().nullable(),
});
export type PhotoTag = z.infer<typeof PhotoTagSchema>;

export const PhotoExifSchema = z.strictObject({
  cameraMake: z.string().nullable(),
  cameraModel: z.string().nullable(),
  lens: z.string().nullable(),
  iso: z.number().int().nullable(),
  aperture: z.number().nullable(),
  /** The upstream string, "1/35". Not a number. */
  shutter: z.string().nullable(),
  focalLength: z.number().nullable(),
  altitude: z.number().nullable(),
});

/** Rank 3 of the cascade. The bracket and the evidence travel with it. */
export const DatingProposalSchema = z.strictObject({
  date: ResolvedDateSchema,
  position: ResolvedPositionSchema.nullable(),
  /** log_entries ids: one click opens the logbook page. */
  evidenceEntryIds: z.array(z.string()),
});

/** Why there is no proposal. A missing row says nothing without its reason. */
export const DatingDoubtSchema = z.strictObject({
  /** OPEN vocabulary — data, not an enum. It has already changed once. */
  reason: z.string(),
  label: z.string().nullable(),
  albumPath: z.string(),
  candidates: z.array(
    z.strictObject({
      place: z.string(),
      range: z.strictObject({ from: IsoDateSchema, to: IsoDateSchema }),
      fixes: z.number().int(),
    }),
  ),
});

/**
 * A caption produced by a vision model. Spec §7.1's third extension: it is a
 * DEDUCTION from appearance, never a reading — and it is its own register,
 * never mixed with `texts[]` (period text) or a human note. `machineOriginal`
 * survives a human edit; it is never destroyed, same rule as a transcription
 * correction.
 */
export const MachineCaptionSchema = z.strictObject({
  text: z.string(),
  keywords: z.array(z.string()),
  kind: z.enum(CaptionKind),
  model: z.string(),
  promptVersion: z.string(),
  createdAt: IsoTimestampSchema,
  machineOriginal: z.string().nullable(),
});
export type MachineCaption = z.infer<typeof MachineCaptionSchema>;

export const CaptionEditInputSchema = z.strictObject({
  text: z.string(),
  keywords: z.array(z.string()).optional(),
});

export const PhotoDetailSchema = PhotoListItemSchema.extend({
  /** Album membership is multiple: 2 to 4 albums per photo. */
  albumPaths: z.array(z.string()),
  tags: z.array(PhotoTagSchema),
  exif: PhotoExifSchema,
  /** Text PRINTED IN the image, not a caption. */
  ocrText: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  relativePath: z.string(),
  /** FIRST-LEVEL fields, never folded into the date. Spec §9.2. */
  proposal: DatingProposalSchema.nullable(),
  doubt: DatingDoubtSchema.nullable(),
  overlappingTextCount: z.number().int(),
  /** NULL until the captioning pass has covered this photo. Spec §7.1. */
  caption: MachineCaptionSchema.nullable(),
  render: RenderAvailabilitySchema,
});
export type PhotoDetail = z.infer<typeof PhotoDetailSchema>;

/**
 * Contextual counts, recomputed against the CURRENT filter — spec §5.4.
 * `tags` is sorted by selectivity descending (fewest photos first); the
 * vocabulary never carries the 901 place-lying tags (`italy` on Tikal,
 * `egypt` on Morocco — spec, `ETAT-TRAVAUX.md` §"tags de lieu mentent"), a
 * server-side exclusion this schema does not need to know the reason for.
 */
export const FacetBucketSchema = z.strictObject({
  value: z.string(),
  count: z.number().int(),
  /** True for the 42 tags over 500 photos. Never hidden — only de-emphasised. */
  tooBroad: z.boolean().optional(),
});
export type FacetBucket = z.infer<typeof FacetBucketSchema>;

export const PhotoFacetsSchema = z.strictObject({
  albums: z.array(FacetBucketSchema),
  tags: z.array(FacetBucketSchema),
  people: z.array(FacetBucketSchema),
  countries: z.array(FacetBucketSchema),
  cities: z.array(FacetBucketSchema),
  years: z.array(FacetBucketSchema),
  /** 0 ⇒ the place axis is disabled, with its reason. */
  positionedCount: z.number().int(),
  withOcrCount: z.number().int(),
  datedToDayCount: z.number().int(),
});
export type PhotoFacets = z.infer<typeof PhotoFacetsSchema>;
