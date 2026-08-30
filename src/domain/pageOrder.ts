import type { TextPage } from '../api/contract/text';

/**
 * v1.5, Task 8: the two orders a page list can show — chronological
 * (default) or notebook order (spec §5.3, "utile quand on cherche la page
 * 12"). Pure comparison, never rendering: `noBareDateRendering.test.ts`
 * would (rightly) flag this logic if it lived inline in a `ui`/`screens`
 * component instead of here.
 */
export function sortPagesByDate(pages: readonly TextPage[]): TextPage[] {
  const dated = pages.filter((p) => p.date !== null);
  const undated = pages.filter((p) => p.date === null);
  dated.sort((a, b) => compareIsoDay(a, b));
  // Pages with no date of their own are grouped at the end, never sorted in
  // as though "no date" came before every date.
  return [...dated, ...undated];
}

export function sortPagesByOrdinal(pages: readonly TextPage[]): TextPage[] {
  return [...pages].sort((a, b) => a.ordinal - b.ordinal);
}

function compareIsoDay(a: TextPage, b: TextPage): number {
  const left = a.date?.start ?? '';
  const right = b.date?.start ?? '';
  return left < right ? -1 : left > right ? 1 : 0;
}
