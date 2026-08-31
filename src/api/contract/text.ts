import { z } from 'zod';

import {
  CorrectionStatus, DateKind, DatePrecision, DateSource, PageSpanSource,
  TextKind, TranscriptionConfidence,
} from '../../shared/enums';

import {
  IsoTimestampSchema, ResolvedDateSchema, Sha256Schema, SingleDayRangeSchema, TextRangeSchema,
} from './common';
import { FacetBucketSchema, ListEnvelopeSchema } from './photo';

/**
 * THE KEY OF A TEXT IS THE COUPLE, NEVER THE ID ALONE.
 *
 * `passages.id` and `log_entries.id` are both `<pageId>/<NNN>`, and 456
 * identifiers exist in BOTH tables: on `logbook/p003`, `001` to `005` collide
 * entirely. A `TextId` therefore never appears alone in a public signature.
 */
export const TextRefSchema = z.strictObject({
  kind: z.enum(TextKind),
  id: z.string(),
});
export type TextRef = z.infer<typeof TextRefSchema>;

/**
 * V1.7, spec "la sélection libre, et pourquoi elle ne casse pas la garantie":
 * the only new vocabulary of 1.7. A free-text selection on "Ma vie" or the
 * web site can cover two passages, or half of one — it names no `TextRef`.
 * `derivedFrom` on a note born that way names the PAGE instead; the server
 * still verifies the selection against the page's own full text, so the
 * guarantee (a client can never assert what the server does not check)
 * holds exactly as it does for a single passage.
 */
export const PageRefSchema = z.strictObject({ kind: z.literal('page'), id: z.string() });
export type PageRef = z.infer<typeof PageRefSchema>;

/**
 * `TaskNoteCreateInput.derivedFrom`: `{kind, id}` only — never `text`. The
 * server reads the source's OWN current effective text itself; a client
 * that could post its own copy would be exactly the hole the "infalsifiable"
 * guarantee (spec, la règle capitale) closes.
 */
export const DerivedFromInputRefSchema = z.union([TextRefSchema, PageRefSchema]);
export type DerivedFromInputRef = z.infer<typeof DerivedFromInputRefSchema>;

/**
 * `TaskNote.derivedFrom`: the reference AND the snapshot taken at copy time
 * — `text`. Never re-fetched live: the snapshot is what lets "Rétablir le
 * texte d'origine" show what was actually copied, even after the source has
 * since been corrected (spec, "le cas tordu").
 */
export const DerivedFromRefSchema = z.union([
  TextRefSchema.extend({ text: z.string() }),
  PageRefSchema.extend({ text: z.string() }),
]);
export type DerivedFromRef = z.infer<typeof DerivedFromRefSchema>;

/**
 * The two date sources a TEXT may legitimately carry BEFORE any correction. A
 * page window and a web span qualify a PAGE or a DOCUMENT — never what a text
 * asserts about itself.
 */
const TEXT_DATE_SOURCES: readonly DateSource[] = [
  DateSource.LOG_ENTRY_DATE,
  DateSource.PASSAGE_DATE_FROM,
];

/**
 * v1.6, contract A10: correcting a text's date is the same act as correcting
 * its transcription — Nicolas ARBITRATES between the reading and what he
 * knows. `DateSource.ANNOTATION` is the one source `dateKind.ts` maps to
 * `decision`, so the EFFECTIVE date (`TextUnit.date`) may now carry it,
 * beside the two original reading sources.
 */
const TEXT_EFFECTIVE_DATE_SOURCES: readonly DateSource[] = [
  ...TEXT_DATE_SOURCES,
  DateSource.ANNOTATION,
];

/**
 * A single day or nothing, at DAY precision — the shape every text date
 * shares, corrected or not. `allowedSources`/`allowedKinds` are the only
 * axis that differs between the ORIGINAL reading (`TextDateSchema`, below)
 * and the EFFECTIVE, possibly-corrected value (`TextEffectiveDateSchema`) —
 * kind/source PAIRING itself is already `ResolvedDateSchema`'s own job
 * (`isKindConsistent`, domain/dateKind.ts), not re-checked here.
 */
function buildTextDateSchema(
  allowedSources: readonly DateSource[],
  allowedKinds: readonly DateKind[],
) {
  return ResolvedDateSchema.superRefine((date, ctx) => {
    if (!allowedKinds.includes(date.kind)) {
      ctx.addIssue({
        code: 'custom',
        path: ['kind'],
        message: `a text date must be ${allowedKinds.join(' or ')}, never a ${date.kind}`,
      });
    }
    if (date.precision !== DatePrecision.DAY) {
      ctx.addIssue({
        code: 'custom',
        path: ['precision'],
        message: `a text date is always at day precision, never ${date.precision}`,
      });
    }
    if (date.start !== date.end) {
      ctx.addIssue({
        code: 'custom',
        path: ['end'],
        message: `a text date covers a single day: start === end, got ${date.start}..${date.end}`,
      });
    }
    if (!allowedSources.includes(date.source)) {
      ctx.addIssue({
        code: 'custom',
        path: ['source'],
        message:
          `"${date.source}" qualifies a page or a document, never what a text asserts. ` +
          `A text date comes from ${allowedSources.join(', ')}.`,
      });
    }
  });
}

/**
 * What the text asserts about itself ORIGINALLY (`TextUnit.dateOriginal`),
 * and NULL when it asserts nothing. NEVER a correction — always the reading,
 * the same pairing as `text`/`textOriginal`.
 *
 * A passage that names no day asserts none. Giving it its page's window, even
 * labelled `inference`, makes it say what it does not say — the window is real
 * and useful, and it lives in `overlap`, not here.
 *
 * Measured: of 2 871 units, 1 840 assert a day and 1 031 assert nothing. So
 * `null` is the normal case for more than a third, never an error case.
 */
export const TextDateSchema = buildTextDateSchema(TEXT_DATE_SOURCES, [DateKind.READING]);

/**
 * `TextUnit.date` — the EFFECTIVE value (contract A10): `coalesce(correction,
 * reading)`. A `decision` (a corrected date, `source: 'annotation'`) is as
 * legitimate here as the original `reading` — `dateOriginal` is what stays
 * pinned to the reading alone.
 */
export const TextEffectiveDateSchema = buildTextDateSchema(
  TEXT_EFFECTIVE_DATE_SOURCES, [DateKind.READING, DateKind.DECISION],
);

/** `PUT /corrections` body. Empty or blank ⇒ 422 EMPTY_CORRECTION (§9.6).
 * `date` (v1.6, A10): omitted leaves an existing date correction untouched;
 * `null` clears it; `{start, end}` sets it (start must equal end, D11). */
export const TextCorrectionInputSchema = z.strictObject({
  ref: TextRefSchema,
  text: z.string(),
  date: SingleDayRangeSchema.nullable().optional(),
});
export type TextCorrectionInput = z.infer<typeof TextCorrectionInputSchema>;

/** `POST /corrections/revert` body. */
export const RevertCorrectionInputSchema = z.strictObject({ ref: TextRefSchema });

/** Global, never per task: an OCR error is wrong in every task. */
export const TextCorrectionSchema = z.strictObject({
  ref: TextRefSchema,
  text: z.string(),
  /**
   * The transcription as it stood AT THE TIME of the correction — the drift
   * witness. A text's key is positional, so re-deriving documents.db shifts
   * every id after a re-cut page; only comparing this text reveals it.
   */
  originalAtCorrection: z.string(),
  /** v1.6, A10: the date correction itself, `null` when only the text was corrected. */
  date: SingleDayRangeSchema.nullable(),
  /** The witness for `date`, same reasoning as `originalAtCorrection` — also
   * `null` when the text had no date originally: a correction that ADDS one
   * destroys nothing to preserve. */
  originalDateAtCorrection: SingleDayRangeSchema.nullable(),
  correctedAt: IsoTimestampSchema,
  status: z.enum(CorrectionStatus),
});

/** Logbook entries only: what the ruled line carries beyond the text. */
export const LogEntryFieldsSchema = z.strictObject({
  /** `HH:MM` as written aboard. The timezone is unknown and unrecorded. */
  time: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  /** Degrees and minutes, a literal transcription. Never reconverted. */
  rawPosition: z.string().nullable(),
  placeName: z.string().nullable(),
  heading: z.string().nullable(),
  wind: z.string().nullable(),
  baro: z.number().nullable(),
  engineHours: z.number().nullable(),
  fixConfidence: z.enum(TranscriptionConfidence),
  remarkConfidence: z.enum(TranscriptionConfidence),
});

/**
 * Gallery captions only (`ref.kind === 'web_caption'`). Contract §11 Q11,
 * recommendation (a) — proposed to `back`, not yet frozen in
 * `docs/api-contract.md`. The link is a DIRECT image match
 * (docs/spike-dhash-galeries.md §9), never a date window: `sha256` names
 * the library photo, `page`/`imagePath` keep the source attributable and
 * reversible, `distance`/`margin` are the match's own traceability, and
 * `verified` — false for anything not yet reviewed by a human — renders as
 * an inference-grade signal, same register as a `carried` page window.
 */
export const GalleryCaptionFieldsSchema = z.strictObject({
  sha256: Sha256Schema,
  page: z.string(),
  imagePath: z.string(),
  distance: z.number().int(),
  margin: z.number().int(),
  verified: z.boolean(),
});
export type GalleryCaptionFields = z.infer<typeof GalleryCaptionFieldsSchema>;

export const TextUnitSchema = z.strictObject({
  ref: TextRefSchema,
  documentId: z.string(),
  /** NULL for passages coming from HTML. */
  pageId: z.string().nullable(),
  ordinal: z.number().int(),

  /** The EFFECTIVE text: corrected if it has been. */
  text: z.string(),
  /** The pipeline transcription, ALWAYS present. Never one without the other. */
  textOriginal: z.string(),
  correction: TextCorrectionSchema.nullable(),

  confidence: z.enum(TranscriptionConfidence),
  /** The EFFECTIVE date: `coalesce(correction, reading)` (v1.6, A10) — a
   * `decision` when Nicolas has arbitrated it, a `reading` otherwise. */
  date: TextEffectiveDateSchema.nullable(),
  /** v1.6, A10: the upstream reading, ALWAYS — never the correction, the
   * same pairing as `text`/`textOriginal`. */
  dateOriginal: TextDateSchema.nullable(),

  /**
   * Qualifies the PAGE window used for overlap, never the date above.
   * `carried` is an inference on an inference: the page names no day and takes
   * the previous one's. It cannot be derived client-side — in a search result
   * the page is not loaded.
   */
  pageSpanSource: z.enum(PageSpanSource).nullable(),
  overlappingPhotoCount: z.number().int(),

  /** Filled only by `GET /texts?q=…`. Offsets in `text`, UTF-16 units. */
  highlights: z.array(TextRangeSchema),
  logEntry: LogEntryFieldsSchema.nullable(),
  /** `ref.kind === 'web_caption'` only. NULL for every passage and entry. */
  galleryCaption: GalleryCaptionFieldsSchema.nullable(),
});
export type TextUnit = z.infer<typeof TextUnitSchema>;

/** `GET /texts` — same envelope shape as `/photos`, one schema for the idea. */
export const TextUnitListSchema = ListEnvelopeSchema(TextUnitSchema);

export const TextDocumentSchema = z.strictObject({
  id: z.string(),
  kind: z.enum(['handwritten', 'html']),
  title: z.string(),
  /** NULL for the 60 HTML documents. */
  pageCount: z.number().int().nullable(),
  passageCount: z.number().int(),
  /** From ref.web_span. NULL = no date, and that is not invented. */
  span: ResolvedDateSchema.nullable(),
  /** False for the 60 HTML: "the web site has no page", an explicit empty panel. */
  hasPages: z.boolean(),
});
export type TextDocument = z.infer<typeof TextDocumentSchema>;

export const TextPageSchema = z.strictObject({
  id: z.string(),
  documentId: z.string(),
  ordinal: z.number().int(),
  label: z.string().nullable(),
  width: z.number().int(),
  height: z.number().int(),
  window: ResolvedDateSchema.nullable(),
  /**
   * v1.5: the page's own resolved date, cascade register → notes → carried
   * inheritance (`app.page_date`). `reading` when the page carries it
   * itself, `inference` when it comes from the previous page in the same
   * document. Distinct from `window`, which stays the pipeline's own
   * overlap-window geometry — the two answer different questions and
   * neither replaces the other.
   */
  date: ResolvedDateSchema.nullable(),
  /**
   * v1.5, Task 14: count of this page's texts matching `GET /pages?q=…`.
   * Filled only when `q` is present (same convention as `TextUnit.highlights`)
   * — `null` otherwise, never `0` standing in for "no query".
   */
  matchCount: z.number().int().nullable(),
  spanSource: z.enum(PageSpanSource).nullable(),
  imageUrl: z.string(),
  /**
   * `pages.region` is NULL on all 155 rows: nothing says where a passage sits
   * on the image. The field exists so the UI does not promise what does not.
   */
  regionsAvailable: z.literal(false),
});
export type TextPage = z.infer<typeof TextPageSchema>;

export const TextDocumentListSchema = z.strictObject({
  items: z.array(TextDocumentSchema),
});
export const TextPageListSchema = z.strictObject({ items: z.array(TextPageSchema) });

/**
 * v1.5, Task 10: `GET /texts/facets?documentId=…` — what a source actually
 * contains, not what remains under the current filter (contract, back's
 * Task 13: unlike `/photos/facets`, this route is not contextual). Same
 * bucket shape as `PhotoFacets` — never a second bucket shape for the same
 * idea.
 */
export const TextFacetsSchema = z.strictObject({
  years: z.array(FacetBucketSchema),
  months: z.array(FacetBucketSchema),
  days: z.array(FacetBucketSchema),
});
export type TextFacets = z.infer<typeof TextFacetsSchema>;
