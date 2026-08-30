export interface PageInput {
  readonly pageId: string;
  readonly ordinal: number;
  /** Dates lues dans le registre réglé — le document officiel, qui fait autorité. */
  readonly registerDates: readonly string[];
  /** Dates lues dans les notes libres. Ne servent QUE si le registre est muet. */
  readonly noteDates: readonly string[];
}

export interface ResolvedPageDate {
  readonly pageId: string;
  readonly start: string;
  readonly end: string;
  readonly source: 'register' | 'notes' | 'carried';
}

/**
 * Registre d'abord, à défaut les notes, à défaut la page précédente — la
 * cascade de la 1.5 pour la date d'une page scannée (journal de bord, « Ma
 * vie »). Ordonné par `ordinal` — le numéro de page réel, physique, fiable —
 * jamais par l'ordre du tableau reçu. Une page antérieure à la première page
 * datée n'a pas de date : l'héritage ne remonte jamais le temps, ici comme
 * partout ailleurs dans l'application. Contrairement au site web (amendement
 * A9), l'ordinal EST un ordre chronologique digne de confiance — la reliure
 * d'un cahier, pas un chemin de fichier.
 */
export function resolvePageDates(pages: readonly PageInput[]): readonly ResolvedPageDate[] {
  const ordered = [...pages].sort((a, b) => a.ordinal - b.ordinal);
  const out: ResolvedPageDate[] = [];
  let carried: { start: string; end: string } | null = null;

  for (const page of ordered) {
    const own = page.registerDates.length > 0
      ? { dates: page.registerDates, source: 'register' as const }
      : page.noteDates.length > 0
        ? { dates: page.noteDates, source: 'notes' as const }
        : null;

    if (own !== null) {
      const start = own.dates.reduce((a, b) => (a < b ? a : b));
      const end = own.dates.reduce((a, b) => (a > b ? a : b));
      out.push({ pageId: page.pageId, start, end, source: own.source });
      carried = { start, end };
    } else if (carried !== null) {
      out.push({ pageId: page.pageId, start: carried.start, end: carried.end, source: 'carried' });
    }
  }
  return out;
}
