import { z } from 'zod';

import {
  CorrectionStatus, DateKind, DatePrecision, DateSource, PageSpanSource,
  TextKind, TranscriptionConfidence,
} from '../../shared/enums';

import {
  IsoTimestampSchema, ResolvedDateSchema, TextRangeSchema,
} from './common';

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
 * The two date sources a TEXT may legitimately carry. A page window and a web
 * span qualify a PAGE or a DOCUMENT — never what a text asserts about itself.
 */
const TEXT_DATE_SOURCES: readonly DateSource[] = [
  DateSource.LOG_ENTRY_DATE,
  DateSource.PASSAGE_DATE_FROM,
];

/**
 * What the text asserts about itself, and NULL when it asserts nothing.
 *
 * A passage that names no day asserts none. Giving it its page's window, even
 * labelled `inference`, makes it say what it does not say — the window is real
 * and useful, and it lives in `overlap`, not here.
 *
 * Measured: of 2 871 units, 1 840 assert a day and 1 031 assert nothing. So
 * `null` is the normal case for more than a third, never an error case.
 *
 * When it is not null, three things hold, and they are checked rather than
 * assumed: the kind is always a READING, the precision is always DAY, and the
 * bounds are equal. The spec's sentence — the logbook and "Ma vie" dates are
 * the only certain dates of the corpus, written on the day, on the page —
 * becomes a property of the schema instead of an approximation.
 */
export const TextDateSchema = ResolvedDateSchema.superRefine((date, ctx) => {
  if (date.kind !== DateKind.READING) {
    ctx.addIssue({
      code: 'custom',
      path: ['kind'],
      message: `a text date is always a reading, never a ${date.kind}`,
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
  if (!TEXT_DATE_SOURCES.includes(date.source)) {
    ctx.addIssue({
      code: 'custom',
      path: ['source'],
      message:
        `"${date.source}" qualifies a page or a document, never what a text asserts. ` +
        `A text date comes from log_entry_date or passage_date_from.`,
    });
  }
});

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
  date: TextDateSchema.nullable(),

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
});
export type TextUnit = z.infer<typeof TextUnitSchema>;

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
