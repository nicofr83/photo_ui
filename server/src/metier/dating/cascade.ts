import { DatePrecision, DateSource } from '@shared/enums';
import type { AlbumInterval } from './album_span.ts';
import { arbitrate } from './arbitration.ts';

/**
 * `dating.db proposals.dateSource`, verbatim from upstream — NOT the same
 * vocabulary as `DateSource` above (that one names what the CASCADE resolved
 * to; this one names what the PIPELINE'S OWN dating tool did).
 *
 *   'logbook-bracket' — the machine matched a place to the logbook: an
 *                        inference, and the only value rank 3 may use.
 *   'manual'           — someone typed this date into the pipeline's dating
 *                        UI: a DECISION, same standing as an
 *                        `annotations.jsonl` entry, just made in a different
 *                        tool. Serving it as rank 3 would render a decision as
 *                        a conjecture — the capital rule, violated by the
 *                        data rather than the code.
 *
 * Today's proposals are all `manual`, and all also carry an
 * `annotations.jsonl` entry, so rank 1 wins first and this gate is never
 * actually exercised in practice — a property of today's data, not a
 * guarantee. Closed to exactly the one value that means "inference": an
 * unrecognised third value falls through exactly like `manual` does, never
 * silently promoted to rank 3.
 */
const RANK_3_DATE_SOURCE = 'logbook-bracket';

export interface CascadeInput {
  readonly captureDateLocal: string | null;
  readonly album: AlbumInterval | null;
  /** Rang 1 — `annotations.jsonl`. La main prime sans condition. */
  readonly annotationDate: string | null;
  /** Rang 3 — une ligne de `dating.proposals`, encore verbatim. */
  readonly proposal: {
    readonly date: string;
    readonly dateSource: string;
    readonly spanHours: number | null;
    readonly evidenceEntryIds: readonly string[];
  } | null;
}

export interface ResolvedCascade {
  readonly resolvedFrom: DateSource | null;
  readonly resolvedStart: string | null;
  readonly resolvedEnd: string | null;
  readonly resolvedPrecision: DatePrecision | null;
  readonly arbitrationGapMonths: number | null;
  readonly arbitrationOutcome: 'accepted' | 'rejected' | null;
  readonly bracketHours: number | null;
  readonly evidenceEntryIds: readonly string[];
}

const UNDATED: ResolvedCascade = {
  resolvedFrom: null, resolvedStart: null, resolvedEnd: null, resolvedPrecision: null,
  arbitrationGapMonths: null, arbitrationOutcome: null, bracketHours: null, evidenceEntryIds: [],
};

/**
 * Les six rangs (`docs/backend-spec.md` §7.5). Pure, aucun accès base — c'est
 * ce qui rend chaque rang testable en trois lignes plutôt qu'avec une base et
 * un `CASE` SQL de cinquante lignes que personne ne relit.
 */
export function resolveCascade(input: CascadeInput): ResolvedCascade {
  const { captureDateLocal, album, annotationDate, proposal } = input;

  // L'arbitrage a lieu dès qu'il y a un album ET un EXIF, quel que soit le
  // rang qui gagnera ensuite : c'est ce qui rend l'écart constatable même
  // quand c'est le rang 1 qui gagne.
  const arbitration = album === null ? null : arbitrate(captureDateLocal, album);
  const withArbitration = {
    arbitrationGapMonths: arbitration?.gapMonths ?? null,
    arbitrationOutcome: arbitration?.outcome ?? null,
  };

  // Rang 1 — la main prime SANS CONDITION. Quelqu'un a ouvert la photo, vu
  // l'EXIF affiché, et tapé autre chose : le contredire était le geste.
  if (annotationDate !== null) {
    return {
      ...UNDATED, ...withArbitration,
      resolvedFrom: DateSource.ANNOTATION, resolvedStart: annotationDate,
      resolvedEnd: annotationDate, resolvedPrecision: DatePrecision.DAY,
    };
  }

  // Rang 2 — l'EXIF retenu par l'arbitrage. Une lecture.
  if (arbitration?.outcome === 'accepted') {
    return {
      ...UNDATED, ...withArbitration,
      resolvedFrom: DateSource.EXIF_ARBITRATED, resolvedStart: arbitration.exifDay,
      resolvedEnd: arbitration.exifDay, resolvedPrecision: DatePrecision.DAY,
    };
  }

  // Rang 3 — la proposition du journal, SEULEMENT si l'amont dit lui-même que
  // c'est une inférence. Une ligne `manual` (ou tout ce qui n'est pas
  // `logbook-bracket`) n'entre pas ici : elle tombe aux rangs suivants.
  if (proposal !== null && proposal.dateSource === RANK_3_DATE_SOURCE) {
    return {
      ...UNDATED, ...withArbitration,
      resolvedFrom: DateSource.LOGBOOK_BRACKET, resolvedStart: proposal.date,
      resolvedEnd: proposal.date, resolvedPrecision: DatePrecision.DAY,
      bracketHours: proposal.spanHours, evidenceEntryIds: proposal.evidenceEntryIds,
    };
  }

  // Rangs 4, 5, 6 — l'album. 4 et 5 ne diffèrent que par le bloc d'arbitrage.
  if (album !== null) {
    const isYear = album.precision === 'year';
    return {
      ...UNDATED, ...withArbitration,
      resolvedFrom: isYear ? DateSource.ALBUM_YEAR : DateSource.ALBUM_MONTH,
      resolvedStart: album.from, resolvedEnd: album.to,
      resolvedPrecision: isYear ? DatePrecision.YEAR
        : album.precision === 'day' ? DatePrecision.DAY : DatePrecision.MONTH,
    };
  }

  // Pas d'album : l'EXIF sert quand même, sans rien contre quoi arbitrer.
  // Sans cette branche, les photos hors hiérarchie seraient sans date.
  const exifDay = captureDateLocal?.slice(0, 10) ?? null;
  if (exifDay !== null && /^\d{4}-\d{2}-\d{2}$/.test(exifDay)) {
    return {
      ...UNDATED,
      resolvedFrom: DateSource.EXIF_ARBITRATED,
      resolvedStart: exifDay, resolvedEnd: exifDay, resolvedPrecision: DatePrecision.DAY,
    };
  }

  return UNDATED;
}
