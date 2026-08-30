import { DateKind, DateSource, PositionSource } from '../shared/enums';

/**
 * Thrown when the server sends a (source, kind) pair that contradicts the
 * canonical table. Spec §7.1: an inference must never look like a reading.
 * `kind` is derived server-side; this is the client-side cross-check, and it
 * fails loudly rather than rendering a date whose nature we cannot trust.
 *
 * `expected` is an array for `page_date`, the one source with two legitimate
 * natures — naming a single "the" expected kind there would itself be a
 * small lie about what the table actually says.
 */
export class KindDisagreementError extends Error {
  constructor(
    readonly source: DateSource | PositionSource,
    readonly received: DateKind,
    readonly expected: DateKind | readonly DateKind[],
  ) {
    super(
      `date source "${source}" is a ${
        typeof expected === 'string' ? expected : expected.join(' or a ')
      }, but the server called it a ${received}`,
    );
    this.name = 'KindDisagreementError';
  }
}

/**
 * The canonical source → nature table. Spec §7.1, contract §2.1. Every
 * source maps to exactly one nature except `page_date`: its cascade
 * (register → notes → carried inheritance) genuinely produces `reading`
 * when a page carries its own date and `inference` when it borrows the
 * previous page's — the ONE nature it can never have is `decision`, since
 * nothing in that cascade arbitrates against conflicting evidence the way
 * an `annotation` does.
 */
export function expectedKindFor(source: DateSource): DateKind | readonly DateKind[] {
  switch (source) {
    // The ONLY decision source. What separates `decision` from `inference` is
    // not WHO acted but WHAT THE GESTURE ESTABLISHES: a dating annotation
    // ARBITRATES — someone saw the EXIF on screen and typed something else.
    case DateSource.ANNOTATION:
      return DateKind.DECISION;

    case DateSource.EXIF_ARBITRATED:
    case DateSource.PASSAGE_DATE_FROM:
    case DateSource.LOG_ENTRY_DATE:
      return DateKind.READING;

    // WEB_SPAN belongs here, not with the decision: a `web_span` range FILLS A
    // VOID rather than arbitrating. None of the 569 web passages carries a
    // date, so a hand-typed range over one is a conjecture. `source` already
    // says a human typed it; `kind` says what it is worth. Contract §4.8,
    // spec §5.7 / §9.4. The ~25 ranges Nicolas will enter therefore render
    // amber italic with the approximation glyph, deliberately.
    case DateSource.LOGBOOK_BRACKET:
    case DateSource.ALBUM_MONTH:
    case DateSource.ALBUM_YEAR:
    case DateSource.PAGE_WINDOW:
    case DateSource.WEB_SPAN:
      return DateKind.INFERENCE;

    case DateSource.PAGE_DATE:
      return [DateKind.READING, DateKind.INFERENCE];

    default: {
      // Adding a DateSource without giving it a nature is a compile error.
      const unreachable: never = source;
      throw new Error(`unmapped DateSource: ${String(unreachable)}`);
    }
  }
}

/** True when `received` is one of the natures `source` allows — one for most sources, two for `page_date`. */
export function isKindConsistent(source: DateSource, received: DateKind): boolean {
  const expected = expectedKindFor(source);
  return Array.isArray(expected) ? expected.includes(received) : expected === received;
}

export function assertKindConsistent(source: DateSource, received: DateKind): void {
  if (!isKindConsistent(source, received)) {
    throw new KindDisagreementError(source, received, expectedKindFor(source));
  }
}

/**
 * The same table for positions. The contract states it in comments only
 * (§2.1: `EXIF // reading`, `LOGBOOK_INTERPOLATED // inference`); spec §7.1
 * makes it binding, because a position interpolated from the logbook is a
 * proposal and a GPS fix is a measurement.
 */
export function expectedKindForPosition(source: PositionSource): DateKind {
  switch (source) {
    case PositionSource.EXIF:
      return DateKind.READING;

    case PositionSource.LOGBOOK_INTERPOLATED:
      return DateKind.INFERENCE;

    default: {
      const unreachable: never = source;
      throw new Error(`unmapped PositionSource: ${String(unreachable)}`);
    }
  }
}

export function assertPositionKindConsistent(
  source: PositionSource,
  received: DateKind,
): void {
  const expected = expectedKindForPosition(source);
  if (received !== expected) {
    throw new KindDisagreementError(source, received, expected);
  }
}
