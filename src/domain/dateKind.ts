import { DateKind, DateSource } from '../shared/enums';

/**
 * Thrown when the server sends a (source, kind) pair that contradicts the
 * canonical table. Spec §7.1: an inference must never look like a reading.
 * `kind` is derived server-side; this is the client-side cross-check, and it
 * fails loudly rather than rendering a date whose nature we cannot trust.
 */
export class KindDisagreementError extends Error {
  constructor(
    readonly source: DateSource,
    readonly received: DateKind,
    readonly expected: DateKind,
  ) {
    super(
      `date source "${source}" is a ${expected}, but the server called it a ${received}`,
    );
    this.name = 'KindDisagreementError';
  }
}

/** The canonical source → nature table. Spec §7.1, contract §2.1. */
export function expectedKindFor(source: DateSource): DateKind {
  switch (source) {
    case DateSource.ANNOTATION:
      return DateKind.DECISION;

    // OPEN DIVERGENCE, raised with contrat-api and spec-frontend on 2026-08-28.
    // The contract's enum glosses WEB_SPAN as "décision humaine"; the spec says
    // twice (§4.2 rule C, §9.4) that these intervals are marked as HUMAN
    // INFERENCES. The contract is normative until they reconcile, so `decision`
    // stands here — but the spec's reading looks right: a web document carries
    // no date at all, so a human range over it is a guess, and rendering a guess
    // as a firm decision is the error §7.1 exists to prevent.
    case DateSource.WEB_SPAN:
      return DateKind.DECISION;

    case DateSource.EXIF_ARBITRATED:
    case DateSource.PASSAGE_DATE_FROM:
    case DateSource.LOG_ENTRY_DATE:
      return DateKind.READING;

    case DateSource.LOGBOOK_BRACKET:
    case DateSource.ALBUM_MONTH:
    case DateSource.ALBUM_YEAR:
    case DateSource.PAGE_WINDOW:
      return DateKind.INFERENCE;

    default: {
      // Adding a DateSource without giving it a nature is a compile error.
      const unreachable: never = source;
      throw new Error(`unmapped DateSource: ${String(unreachable)}`);
    }
  }
}

export function assertKindConsistent(source: DateSource, received: DateKind): void {
  const expected = expectedKindFor(source);
  if (received !== expected) {
    throw new KindDisagreementError(source, received, expected);
  }
}
