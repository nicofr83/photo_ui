/**
 * `YYYY-MM-DD` → `DD/MM/YYYY`. Pure string slicing on a plain civil day —
 * never a `ResolvedDate` (no kind/precision to lose): a note's attribution
 * date and a web-dating proposal are both suggestions or fixed facts, not a
 * value `ResolvedDateView` has any nature to show for. Shared so the rule
 * lives in exactly one place.
 */
export function formatDDMMYYYY(isoDay: string): string {
  const [year, month, day] = isoDay.split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}
