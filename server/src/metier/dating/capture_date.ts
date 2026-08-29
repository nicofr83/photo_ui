/**
 * Éclate `photos.captureDate` amont — six formats coexistent dans une seule
 * colonne, 76 % sans fuseau — en les trois colonnes brutes de
 * `pipeline.photo` : `capture_date_local`, `capture_offset_min`,
 * `capture_date_raw`. LIT, ne CONVERTIT jamais : passer par `new Date(raw)`
 * réinterpréterait l'heure dans le fuseau de la machine qui exécute l'import.
 */
export interface ParsedCaptureDate {
  readonly local: string | null;
  readonly offsetMin: number | null;
  readonly raw: string | null;
}

// `Z` ou `±HH:MM` en toute fin de chaîne, après d'éventuelles secondes
// fractionnaires — jamais ailleurs, pour ne pas mordre dans la date elle-même.
const TRAILING_ZONE = /(Z|[+-]\d{2}:\d{2})$/;

export function parseCaptureDate(raw: string | null): ParsedCaptureDate {
  if (raw === null) return { local: null, offsetMin: null, raw: null };

  const match = TRAILING_ZONE.exec(raw);
  const zone = match?.[1];
  if (zone === undefined) return { local: raw, offsetMin: null, raw };

  const local = raw.slice(0, raw.length - zone.length);
  if (zone === 'Z') return { local, offsetMin: 0, raw };

  const sign = zone.startsWith('-') ? -1 : 1;
  const hours = Number(zone.slice(1, 3));
  const minutes = Number(zone.slice(4, 6));
  return { local, offsetMin: sign * (hours * 60 + minutes), raw };
}
