/**
 * Coded values shared by the backend and the frontend.
 * Transcribed from `docs/api-contract.md` §2.1 — this file is normative.
 *
 * `as const` objects rather than TypeScript `enum`: they survive bundling,
 * serialise to JSON as-is, and the union type is derived from them.
 */

/** Precision of EACH BOUND, not the width of the interval. */
export const DatePrecision = {
  DAY: 'day',
  MONTH: 'month',
  YEAR: 'year',
} as const;
export type DatePrecision = (typeof DatePrecision)[keyof typeof DatePrecision];

/** The capital rule: reading · proposal · human decision. */
export const DateKind = {
  READING: 'reading',
  INFERENCE: 'inference',
  DECISION: 'decision',
} as const;
export type DateKind = (typeof DateKind)[keyof typeof DateKind];

/** Where a date comes from. CLOSED vocabulary, shared by photos and texts. */
export const DateSource = {
  // photos — the cascade
  ANNOTATION: 'annotation',
  EXIF_ARBITRATED: 'exif_arbitrated',
  LOGBOOK_BRACKET: 'logbook_bracket',
  ALBUM_MONTH: 'album_month',
  ALBUM_YEAR: 'album_year',
  // texts
  PASSAGE_DATE_FROM: 'passage_date_from',
  LOG_ENTRY_DATE: 'log_entry_date',
  PAGE_WINDOW: 'page_window',
  WEB_SPAN: 'web_span',
} as const;
export type DateSource = (typeof DateSource)[keyof typeof DateSource];

/** Nature of a position. */
export const PositionSource = {
  EXIF: 'exif',
  LOGBOOK_INTERPOLATED: 'logbook_interpolated',
} as const;
export type PositionSource = (typeof PositionSource)[keyof typeof PositionSource];

/** Where a page's window comes from. `carried` is an inference: it must show. */
export const PageSpanSource = {
  PASSAGES: 'passages',
  ENTRIES: 'entries',
  CARRIED: 'carried',
} as const;
export type PageSpanSource = (typeof PageSpanSource)[keyof typeof PageSpanSource];

/** The three overlap rules. */
export const OverlapRule = {
  LOGBOOK_ENTRY: 'logbook_entry',
  PASSAGE: 'passage',
  WEB_SPAN: 'web_span',
} as const;
export type OverlapRule = (typeof OverlapRule)[keyof typeof OverlapRule];

/**
 * A text's namespace. It is PART OF ITS KEY: 456 identifiers exist in both
 * `passages` and `log_entries`.
 */
export const TextKind = { PASSAGE: 'passage', LOG_ENTRY: 'log_entry' } as const;
export type TextKind = (typeof TextKind)[keyof typeof TextKind];

export const PhotoScope = {
  HIERARCHY: 'hierarchy',
  OUT_OF_HIERARCHY: 'out_of_hierarchy',
  ALL: 'all',
} as const;
export type PhotoScope = (typeof PhotoScope)[keyof typeof PhotoScope];

export const PhotoSort = {
  DATE_ASC: 'date_asc',
  DATE_DESC: 'date_desc',
  AESTHETICS_DESC: 'aesthetics_desc',
  ALBUM: 'album',
  OVERLAP: 'overlap',
} as const;
export type PhotoSort = (typeof PhotoSort)[keyof typeof PhotoSort];

/** Which field answered a textual axis. "We cast wide, we do not tell wide." */
export const MatchField = {
  ALBUM_PATH: 'album_path',
  GROUP_NAME: 'group_name',
  PLACE_CITY: 'place_city',
  PLACE_COUNTRY: 'place_country',
  PLACE_STATE: 'place_state',
  PLACE_SUBLOCATION: 'place_sublocation',
  PERSON: 'person',
  TAG: 'tag',
  OCR: 'ocr',
  CAPTION: 'caption',
  CAPTION_KEYWORD: 'caption_keyword',
  FILE_NAME: 'file_name',
} as const;
export type MatchField = (typeof MatchField)[keyof typeof MatchField];

export const SelectionReason = {
  MANUAL: 'manual',
  DATE_RANGE: 'date_range',
  ALBUM: 'album',
  TAG: 'tag',
  PERSON: 'person',
  PLACE: 'place',
  TEXT_OVERLAP: 'text_overlap',
  SEARCH: 'search',
} as const;
export type SelectionReason = (typeof SelectionReason)[keyof typeof SelectionReason];

export const TaskState = {
  DRAFT: 'draft',
  EXPORTED: 'exported',
  EXPORTED_STALE: 'exported_stale',
} as const;
export type TaskState = (typeof TaskState)[keyof typeof TaskState];

export const ErrorCode = {
  UNKNOWN_PARAMETER: 'UNKNOWN_PARAMETER',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  NOT_FOUND: 'NOT_FOUND',
  SLUG_TAKEN: 'SLUG_TAKEN',
  TARGET_DIRECTORY_EXISTS: 'TARGET_DIRECTORY_EXISTS',
  EMPTY_CORRECTION: 'EMPTY_CORRECTION',
  VOLUME_UNAVAILABLE: 'VOLUME_UNAVAILABLE',
  SOURCE_FILE_MISSING: 'SOURCE_FILE_MISSING',
  NOT_RENDERABLE: 'NOT_RENDERABLE',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  IMPORT_IN_PROGRESS: 'IMPORT_IN_PROGRESS',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
