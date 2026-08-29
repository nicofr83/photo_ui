import type { AlbumInterval } from './album_span.ts';

/**
 * L'arbitrage EXIF-contre-album, rang 2 et 4 de la cascade
 * (`docs/backend-spec.md` §7.4). L'écart est stocké DES DEUX CÔTÉS, retenu
 * comme écarté — c'est ce qui distingue le rang 4 (« l'EXIF existait, c'est
 * une date de scan ») du rang 5 (« il n'y avait pas d'EXIF »), que
 * `resolved_from` seul ne distingue pas.
 */
export interface Arbitration {
  readonly outcome: 'accepted' | 'rejected';
  readonly gapMonths: number;
  readonly exifDay: string;
}

const WINDOW_MONTHS = 6;

/** Nombre de mois CIVILS entre deux jours, non signé. */
export function monthsBetween(a: string, b: string): number {
  const months = (iso: string): number => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
  return Math.abs(months(a) - months(b));
}

/**
 * Le jour civil d'un `captureDate` amont, LU et jamais converti. Six formats
 * coexistent dans une seule colonne amont et 76 % n'ont AUCUN fuseau ; passer
 * par `new Date(raw).getDate()` décalerait le jour de ceux qui en ont un, dans
 * le fuseau de la machine qui exécute l'import.
 */
function civilDay(captureDateLocal: string): string | null {
  const day = captureDateLocal.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * La règle : l'EXIF est retenu si son jour tombe dans l'intervalle de l'album,
 * élargi de 6 mois de chaque côté. Pour un album au mois, la comparaison se
 * fait EN MOIS ENTIERS — l'album ne prétend pas au jour. Pour un album à
 * année seule, la fenêtre porte sur l'année.
 *
 * Rend `null` quand il n'y a AUCUN EXIF : c'est le rang 5, et il ne doit
 * jamais se confondre avec un rang 4 dont l'écart vaudrait 0 par erreur.
 */
export function arbitrate(captureDateLocal: string | null, album: AlbumInterval): Arbitration | null {
  if (captureDateLocal === null) return null;
  const exifDay = civilDay(captureDateLocal);
  if (exifDay === null) return null;

  if (album.precision === 'year') {
    const sameYear = exifDay.slice(0, 4) === album.from.slice(0, 4);
    return {
      outcome: sameYear ? 'accepted' : 'rejected',
      gapMonths: monthsBetween(exifDay, album.from),
      exifDay,
    };
  }

  const gapMonths = exifDay < album.from ? monthsBetween(exifDay, album.from)
    : exifDay > album.to ? monthsBetween(exifDay, album.to)
      : 0;
  return { outcome: gapMonths <= WINDOW_MONTHS ? 'accepted' : 'rejected', gapMonths, exifDay };
}
