/**
 * Rang 0 de la cascade — l'intervalle d'un album, avant tout EXIF ou
 * annotation. Fonctions PURES, aucun accès base : les rangs 2, 4, 5 et 6 s'en
 * servent, donc il est calculé d'abord, pour tous les albums.
 */
export interface AlbumInterval {
  readonly from: string;
  readonly to: string;
  readonly presumed: boolean;
  readonly precision: 'day' | 'month' | 'year';
}

// `(?!\d)` empêche `\d{1,2}` de mordre dans un nombre plus long : sans lui,
// un hypothétique `2000-2001` produirait un mois 20.
const PREFIX = /^(\d{4})(?:-(\d{1,2})(?!\d))?/;
const DURATION = /\d+\s*(mois|semaines?|jours?|ans?)/i;

export function parseAlbumPrefix(albumName: string): { year: number | null; month: number | null } {
  const match = PREFIX.exec(albumName);
  if (match === null) return { year: null, month: null };
  const year = Number(match[1]);
  const raw = match[2];
  if (raw === undefined) return { year, month: null };
  const month = Number(raw);
  // NN > 12 est un numéro de voyage ou de semaine, pas un mois.
  return { year, month: month >= 1 && month <= 12 ? month : null };
}

const pad = (n: number): string => String(n).padStart(2, '0');
const lastDayOfMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
function endOfMonth(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  return `${iso.slice(0, 7)}-${pad(lastDayOfMonth(year, month))}`;
}

/**
 * La règle de rang 0 (`docs/backend-spec.md` §7.3) :
 *   `ref.album_span` saisi → ses bornes, jamais présumées.
 *   sinon un préfixe `aaaa-NN` avec NN un mois réel → le mois entier, présumé.
 *   sinon (NN > 12, ou année seule) → l'année entière, présumée.
 *
 * Une saisie de `ref.album_span` porte des bornes QUELCONQUES : `from === to`
 * reste au jour (l'album tient en un jour) ; sinon les bornes sont ÉLARGIES au
 * mois entier — jamais rétrécies, ce qui perdrait des photos. L'intervalle
 * exact tel que tapé reste dans `ref.album_span`, que l'écran de réglage
 * affiche ; ce qui sort d'ici sert la cascade, pas l'édition.
 */
export function albumInterval(
  albumName: string,
  refSpan: { from: string; to: string } | null,
): AlbumInterval | null {
  if (refSpan !== null) {
    if (refSpan.from === refSpan.to) {
      return { from: refSpan.from, to: refSpan.to, presumed: false, precision: 'day' };
    }
    return {
      from: startOfMonth(refSpan.from), to: endOfMonth(refSpan.to),
      presumed: false, precision: 'month',
    };
  }

  const { year, month } = parseAlbumPrefix(albumName);
  if (year === null) return null;
  if (month === null) {
    return { from: `${String(year)}-01-01`, to: `${String(year)}-12-31`, presumed: true, precision: 'year' };
  }
  return {
    from: `${String(year)}-${pad(month)}-01`,
    to: `${String(year)}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
    presumed: true, precision: 'month',
  };
}

/**
 * Heuristique d'AIDE À LA SAISIE. Elle trie la liste de l'écran de réglage —
 * ce n'est jamais une source de date : un album qu'elle rate (comme le span de
 * dix-sept mois de « Maison rose Algès », un seul toponyme, aucune durée) est
 * rattrapé par d'autres indices côté client, jamais inventé ici.
 */
export function isSuspectedRange(albumName: string): boolean {
  if (DURATION.test(albumName)) return true;
  const body = albumName.replace(PREFIX, '').replace(/^[\s-]+/, '');
  const segments = body.split(/\s*-\s*|\s+et\s+/).map((s) => s.trim()).filter((s) => /\p{L}/u.test(s));
  return segments.length >= 2;
}
