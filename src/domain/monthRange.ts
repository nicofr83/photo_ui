/**
 * The date selector works at month granularity (spec §6.1) while the contract
 * speaks civil days. Converting here rather than in a component keeps the
 * month-end arithmetic — and its leap year — in one tested place.
 */

/** `2000-02` → `2000-02-01`. Returns null on anything that is not `YYYY-MM`. */
export function firstDayOfMonth(month: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const monthNumber = Number(month.slice(5, 7));
  if (monthNumber < 1 || monthNumber > 12) return null;
  return `${month}-01`;
}

/** `2000-02` → `2000-02-29`. Day 0 of the next month is the last of this one. */
export function lastDayOfMonth(month: string): string | null {
  if (firstDayOfMonth(month) === null) return null;
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, '0')}`;
}

/** `1999-10-14` → `1999-10`, for filling the month inputs back in. */
export function toMonthInput(day: string | null): string {
  return day === null ? '' : day.slice(0, 7);
}
