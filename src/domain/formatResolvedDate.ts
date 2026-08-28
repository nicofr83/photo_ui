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

function renderText(date: ResolvedDate): string {
  const year = date.start.slice(0, 4);
  switch (date.precision) {
    case DatePrecision.DAY:
      return date.start;
    case DatePrecision.MONTH: {
      const name = MONTHS[Number(date.start.slice(5, 7)) - 1];
      if (name === undefined) {
        throw new Error(`malformed month in resolved start: ${date.start}`);
      }
      return `${name} ${year}`;
    }
    case DatePrecision.YEAR:
      return year;
    default: {
      const unreachable: never = date.precision;
      throw new Error(`unmapped DatePrecision: ${String(unreachable)}`);
    }
  }
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

  const text = renderText(date);
  return {
    kind: date.kind,
    glyph: GLYPH[date.kind],
    text,
    detail: renderDetail(date, arbitration),
    label: `${NATURE[date.kind]} : ${text}`,
  };
}
