import { TextSource } from './textSource';

/**
 * v1.5, Task 11. Must produce EXACTLY the prefix the server locks onto
 * (`server/src/metier/tasks/note_title.ts#attributionPrefix`, read-only
 * reference — never edited from here): the two functions are the same rule
 * written twice, and Task 14 is what verifies they still agree. The three
 * labels below are copied verbatim from the server's own `SOURCE_LABELS`,
 * lowercase, no trailing comma — `attributionTitle` adds the ", " itself.
 */
const SOURCE_LABEL: Record<TextSource, string> = {
  [TextSource.LOGBOOK]: 'journal de bord',
  [TextSource.MA_VIE]: 'ma vie',
  [TextSource.WEB]: 'site web',
};

interface PageAttributionInput {
  readonly source: typeof TextSource.LOGBOOK | typeof TextSource.MA_VIE;
  readonly ordinal: number;
  /** The PAGE's own date (Task 1), never a day invented for a page that has none. */
  readonly date: string | null;
}

interface WebAttributionInput {
  readonly source: typeof TextSource.WEB;
  readonly documentTitle: string;
  /** Pre-formatted ("1999-2002" or a single year) — not a `ResolvedDate`:
   * turning one into a string is the caller's job, and it never touches
   * this file (see `noBareDateRendering.test.ts` — this stays a plain
   * string-in, string-out function either way). */
  readonly span: string | null;
}

export type AttributionInput = PageAttributionInput | WebAttributionInput;

function formatDDMMYYYY(isoDay: string): string {
  const [year, month, day] = isoDay.split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

/**
 * Spec: "Le titre porte l'attribution" — the source, the page, and the
 * page's date when it has one; the site names its document instead, with
 * its span in parentheses when one was entered. This prefix is LOCKED once
 * a note exists (server, `titleKeepsPrefix`) — never fabricate a day for an
 * undated page, and never change this format without updating the server's
 * copy of the same rule in the same change.
 */
export function attributionTitle(input: AttributionInput): string {
  if (input.source === TextSource.WEB) {
    const span = input.span === null ? '' : ` (${input.span})`;
    return `${SOURCE_LABEL[TextSource.WEB]}, ${input.documentTitle}${span}`;
  }
  const day = input.date === null ? '' : ` du ${formatDDMMYYYY(input.date)}`;
  return `${SOURCE_LABEL[input.source]}, page ${String(input.ordinal)}${day}`;
}

/** "1999-2002", or a single year when the span does not cross one. Pure
 * string slicing on ISO days — no `ResolvedDateView`, this is a note
 * title's parenthetical, not a rendered date. */
export function formatYearSpan(start: string, end: string): string {
  const startYear = start.slice(0, 4);
  const endYear = end.slice(0, 4);
  return startYear === endYear ? startYear : `${startYear}-${endYear}`;
}
