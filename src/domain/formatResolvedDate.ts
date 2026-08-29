import type { DateArbitration, ResolvedDate } from '../shared/date_interface';
import { DateKind, DatePrecision, DateSource } from '../shared/enums';

import { assertKindConsistent } from './dateKind';

/** What a date looks like once rendered. The only shape the UI is given. */
export interface FormattedDate {
  readonly kind: DateKind | 'absent';
  readonly glyph: '' | '≈' | '✓';
  readonly text: string;
  readonly detail: string | null;
  /** The nature in words. Colour is never the only channel. */
  readonly label: string;
}

/**
 * Literal month names rather than `Intl.DateTimeFormat`: the output must be
 * identical in every environment, and a test must never depend on the locale
 * of the machine running it.
 */
const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const;

const GLYPH: Record<DateKind, FormattedDate['glyph']> = {
  [DateKind.READING]: '',
  [DateKind.INFERENCE]: '≈',
  [DateKind.DECISION]: '✓',
};

const NATURE: Record<DateKind, string> = {
  [DateKind.READING]: 'date lue',
  [DateKind.INFERENCE]: 'date inférée',
  [DateKind.DECISION]: 'date décidée à la main',
};

const ABSENT = 'sans date';

/** One bound, rendered at the date's precision. */
function renderBound(bound: string, precision: DatePrecision): string {
  const year = bound.slice(0, 4);
  switch (precision) {
    case DatePrecision.DAY:
      return bound;
    case DatePrecision.MONTH: {
      const name = MONTHS[Number(bound.slice(5, 7)) - 1];
      if (name === undefined) {
        throw new Error(`malformed month in resolved bound: ${bound}`);
      }
      return `${name} ${year}`;
    }
    case DatePrecision.YEAR:
      return year;
    default: {
      const unreachable: never = precision;
      throw new Error(`unmapped DatePrecision: ${String(unreachable)}`);
    }
  }
}

/**
 * `precision` qualifies each BOUND, not the width of the interval. A
 * `ref.album_span` at month precision can cover seventeen months — that is the
 * measured case of `1998-02-Maison rose Algès`. Rendering `start` alone would
 * show "février 1998" and make seventeen months look like one: the capital
 * rule's fault applied to width instead of nature.
 *
 * So: render the point when both bounds coincide AT THAT PRECISION, and the
 * range when they do not.
 */
function renderText(date: ResolvedDate): { text: string; spoken: string } {
  const from = renderBound(date.start, date.precision);
  const to = renderBound(date.end, date.precision);
  if (from === to) return { text: from, spoken: from };
  return { text: `${from} – ${to}`, spoken: `de ${from} à ${to}` };
}

function renderDetail(
  date: ResolvedDate,
  arbitration: DateArbitration | null,
): string | null {
  if (arbitration !== null) {
    return arbitration.outcome === 'accepted'
      ? `EXIF, confirmé à ${String(arbitration.gapMonths)} mois du mois d’album`
      : `EXIF écarté, à ${String(arbitration.gapMonths)} mois du mois d’album`;
  }
  if (date.bracketHours !== null) {
    return `± ${String(date.bracketHours)} h`;
  }
  // A proposal owes its bracket. Without one, say so — never an unsupported number.
  if (date.source === DateSource.LOGBOOK_BRACKET) {
    return 'sans fourchette';
  }
  return null;
}

/**
 * Turns a resolved date into the only rendering the UI is allowed to show.
 * Spec §7.1: three natures, never merged, down to the pixel.
 *
 * Throws `KindDisagreementError` if the date's `kind` contradicts its `source`.
 * Failing loudly is the point: a date whose nature we cannot trust must not
 * reach the screen at all.
 */
export function formatResolvedDate(
  date: ResolvedDate | null,
  arbitration: DateArbitration | null = null,
): FormattedDate {
  if (date === null) {
    return { kind: 'absent', glyph: '', text: ABSENT, detail: null, label: ABSENT };
  }

  assertKindConsistent(date.source, date.kind);

  const { text, spoken } = renderText(date);
  return {
    kind: date.kind,
    glyph: GLYPH[date.kind],
    text,
    detail: renderDetail(date, arbitration),
    // `spoken` rather than `text`: a screen reader should hear "de février 1998
    // à juin 1999", not a dash it may or may not announce.
    label: `${NATURE[date.kind]} : ${spoken}`,
  };
}
