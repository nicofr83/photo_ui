/**
 * La date qu'un texte AFFIRME et la fenêtre qu'il COUVRE sont deux choses
 * différentes. Une entrée de journal du 14 octobre 1999 affirme ce jour-là —
 * une lecture, écrite le jour même — mais pour le recouvrement, la règle A lui
 * fait couvrir jusqu'à la veille de la journée suivante renseignée, parfois 92
 * jours. Écrire cette extension dans la date affirmée transformerait une
 * lecture exacte en une affirmation de trois mois — d'où deux intervalles,
 * jamais fondus.
 */
export interface CoverWindow {
  readonly start: string;
  readonly end: string;
}

const dayBefore = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Règle A. Le journal a des jours renseignés sur une fraction de la
 * traversée : on photographie au mouillage, on tient le journal en mer. Les
 * écarts vont jusqu'à 92 jours, et AUCUN plafond n'est appliqué — un seuil
 * masquerait des recouvrements corrects autant que du bruit, en silence.
 */
export function logbookCovers(days: readonly string[]): Map<string, CoverWindow> {
  const distinct = [...new Set(days)].sort();
  const covers = new Map<string, CoverWindow>();
  for (const [index, day] of distinct.entries()) {
    const next = distinct[index + 1];
    covers.set(day, { start: day, end: next === undefined ? day : dayBefore(next) });
  }
  return covers;
}

/** Règle B. Sa propre date d'abord ; à défaut la fenêtre de sa page ; sinon rien. */
export function passageCovers(
  dateFrom: string | null,
  pageWindow: CoverWindow | null,
): CoverWindow | null {
  if (dateFrom !== null) return { start: dateFrom, end: dateFrom };
  return pageWindow;
}

/**
 * Règle C. Non matérialisée : `ref.web_span` change à tout moment (§8.1).
 * Sans span saisi, un passage web ne couvre rien — faire couvrir « tout »
 * ferait remonter chaque photo du corpus sur chacun des 569 passages du site.
 */
export function webCovers(span: { readonly from: string; readonly to: string } | null): CoverWindow | null {
  return span === null ? null : { start: span.from, end: span.to };
}
