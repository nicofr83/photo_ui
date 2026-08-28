/**
 * Date shapes shared by the backend and the frontend.
 * Transcribed from `docs/api-contract.md` §2.2 — this file is normative.
 *
 * The capital rule (spec §7.1) holds structurally here: a date cannot travel
 * without its nature, because `ResolvedDate` has no optional field.
 */
import type { DateKind, DatePrecision, DateSource, PositionSource } from './enums';

/**
 * A civil day, `YYYY-MM-DD`. NO timezone, NO time, NEVER UTC.
 * Branded: a string literal cannot be assigned without going through
 * `parseIsoDate`. That is what stops a bare `date: string` reappearing.
 */
export type IsoDate = string & { readonly __isoDate: unique symbol };

/** A real instant, ISO-8601 UTC with `Z`. Creations and exports — never a capture. */
export type IsoTimestamp = string & { readonly __isoTimestamp: unique symbol };

/**
 * A naive LOCAL timestamp, `YYYY-MM-DDTHH:MM[:SS]`, with no zone. An upstream
 * `captureDate` has six formats and 76 % carry no zone at all. Never converted.
 */
export type LocalDateTime = string & { readonly __localDateTime: unique symbol };

/**
 * What the system ASSERTS about the date of a thing.
 *
 * `precision` qualifies EACH BOUND, not the width of the interval:
 *   a photo "octobre 1999" → [1999-10-01, 1999-10-31] precision 'month'
 *   a 3-day page window    → [1999-09-23, 1999-09-25] precision 'day'
 */
export interface ResolvedDate {
  /** Always both present, even when equal. */
  readonly start: IsoDate;
  readonly end: IsoDate;
  readonly precision: DatePrecision;
  readonly kind: DateKind;
  readonly source: DateSource;
  /**
   * The proposal's bracket. NULL everywhere else. Without it the UI says
   * "sans fourchette" — never an unsupported number.
   */
  readonly bracketHours: number | null;
}

/** A position, with its nature. Same rule as a date. */
export interface ResolvedPosition {
  readonly lat: number;
  readonly lon: number;
  readonly kind: DateKind;
  readonly source: PositionSource;
}

/**
 * The EXIF ↔ album arbitration, made observable.
 * `outcome: 'accepted'` = the EXIF was kept · `'rejected'` = it is a scan date.
 * The absence of this block means there was no EXIF at all.
 */
export interface DateArbitration {
  readonly exifDate: LocalDateTime;
  readonly gapMonths: number;
  readonly outcome: 'accepted' | 'rejected';
}

/** What the user ASKS (a filter) or DECLARES (a task's period). */
export interface CivilDayRange {
  readonly from: IsoDate;
  readonly to: IsoDate;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isRealCalendarDay(raw: string): boolean {
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  const day = Number(raw.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  // Day 0 of the next month is the last day of this one.
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDayOfMonth;
}

/** Non-throwing guard, for places that must branch rather than fail. */
export function isIsoDate(raw: string): raw is IsoDate {
  return ISO_DAY.test(raw) && isRealCalendarDay(raw);
}

/** Throws on anything that is not a real civil day. */
export function parseIsoDate(raw: string): IsoDate {
  if (raw === '') throw new Error('empty string is not a civil day');
  if (!ISO_DAY.test(raw)) {
    throw new Error(`"${raw}" is not a civil day: expected YYYY-MM-DD`);
  }
  if (!isRealCalendarDay(raw)) {
    throw new Error(`"${raw}" is not a real calendar day`);
  }
  return raw as IsoDate;
}
