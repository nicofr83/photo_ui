/**
 * On croise deux INTERVALLES, jamais un point (contrat) : `photoSpanDays` est
 * ce qu'on IGNORE de la photo (la largeur de sa propre plage — zéro pour une
 * date au jour près), `textSpanDays` ce que le texte COUVRE. Aucun plafond de
 * largeur : 40 % des dates de photo ne sont pas des mesures, un seuil
 * masquerait des recouvrements corrects autant que du bruit, en silence.
 */
export interface OverlapWindow {
  readonly start: string;
  readonly end: string;
}

export interface OverlapInfo {
  readonly rule: string;
  readonly photoSpanDays: number;
  readonly textSpanDays: number;
  readonly totalSpanDays: number;
  readonly distanceToCentreDays: number;
}

function toDays(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
}

/** Largeur d'un intervalle, en jours — zéro pour une date au jour près. Exportée : `OverlapSummary.windowDays` s'en sert aussi. */
export function spanDays(window: OverlapWindow): number {
  return toDays(window.end) - toDays(window.start);
}

function centreDays(window: OverlapWindow): number {
  return toDays(window.start) + spanDays(window) / 2;
}

export function computeOverlapInfo(photo: OverlapWindow, text: OverlapWindow, rule: string): OverlapInfo {
  const photoSpanDays = spanDays(photo);
  const textSpanDays = spanDays(text);
  return {
    rule,
    photoSpanDays,
    textSpanDays,
    totalSpanDays: photoSpanDays + textSpanDays,
    distanceToCentreDays: Math.abs(centreDays(photo) - centreDays(text)),
  };
}
