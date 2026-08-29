import type { DatabaseSync } from 'node:sqlite';

import { normalizeNfc } from './nfc.ts';

/**
 * `dating.db proposals`, une ligne — rang 3 de la cascade, encore verbatim.
 *
 * `dateSource` et `confidence` voyagent SANS INTERPRÉTATION jusqu'à
 * `pipeline.dating_proposal` : c'est `cascade.ts` qui décide, à partir de
 * `dateSource`, si une ligne peut jouer le rang 3 (`'logbook-bracket'`
 * seulement — jamais `'manual'`, qui est une décision humaine prise dans
 * l'UI de la pipeline). Ce lecteur ne filtre rien lui-même : filtrer ici
 * perdrait la distinction avant qu'elle atteigne la base.
 */
export interface RawProposal {
  readonly photoId: string;
  readonly date: string;
  readonly dateSource: string;
  readonly confidence: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly positionSource: string | null;
  /** JSON amont, tel quel : `evidence_entry_ids` en aval, jamais reparsé ici. */
  readonly evidence: string;
  readonly spanHours: number | null;
}

/** `dating.db unresolved` — le motif de l'absence de proposition. */
export interface RawDoubt {
  readonly photoId: string;
  readonly albumPath: string;
  /** VOCABULAIRE OUVERT, amont — a déjà changé sous le projet. */
  readonly reason: string;
  /** JSON amont ou NULL, tel quel. */
  readonly candidates: string | null;
}

export function* readProposals(db: DatabaseSync): Generator<RawProposal> {
  for (const row of db.prepare(`
    SELECT photoId, date, dateSource, confidence, latitude, longitude,
           positionSource, evidence, spanHours
      FROM proposals`).iterate()) {
    yield normalizeNfc(row as unknown as RawProposal);
  }
}

export function* readUnresolved(db: DatabaseSync): Generator<RawDoubt> {
  for (const row of db.prepare(`
    SELECT photoId, albumPath, reason, candidates FROM unresolved`).iterate()) {
    yield normalizeNfc(row as unknown as RawDoubt);
  }
}
