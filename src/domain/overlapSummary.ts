import type { OverlapSummary } from '../api/contract/overlap';

/**
 * Spec §4.3: the counter is explicit — "87 photos dans une fenêtre de 41 jours,
 * dont 34 datées au mois seulement". It says what the proposal is worth AND
 * where its weakness comes from, because the weakness is entirely on the image
 * side: the text dates are certain, the photo dates are not.
 */
export function describeOverlap(summary: OverlapSummary): string {
  if (summary.matchCount === 0) return 'aucune photo dans cette fenêtre';

  const photos = `${String(summary.matchCount)} photo${summary.matchCount > 1 ? 's' : ''}`;
  const window = `${String(summary.windowDays)} jour${summary.windowDays > 1 ? 's' : ''}`;
  const head = `${photos} dans une fenêtre de ${window}`;

  const coarse = summary.datedToMonthCount + summary.datedToYearCount;
  const caveats: string[] = [];

  if (coarse > 0) {
    const unit = summary.datedToYearCount > 0 ? 'au mois ou à l’année' : 'au mois';
    caveats.push(`${String(coarse)} datée${coarse > 1 ? 's' : ''} ${unit} seulement`);
  }
  // Undated is a different problem from coarsely dated, so it is named apart.
  if (summary.undatedCount > 0) {
    caveats.push(`${String(summary.undatedCount)} sans date`);
  }

  return caveats.length === 0 ? head : `${head}, dont ${caveats.join(' et ')}`;
}
