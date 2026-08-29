import { stat } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

/** Ouvre une des quatre bases amont, EN LECTURE SEULE. Jamais un writer. */
export function openReadOnly(path: string): DatabaseSync {
  return new DatabaseSync(path, { readOnly: true });
}

export interface Fingerprint {
  readonly name: string;
  readonly path: string;
  readonly mtimeMs: number;
  readonly size: number;
}

export async function fingerprint(name: string, path: string): Promise<Fingerprint> {
  const s = await stat(path);
  return { name, path, mtimeMs: s.mtimeMs, size: s.size };
}

export async function sourceFingerprints(
  sources: readonly { readonly name: string; readonly path: string }[],
): Promise<Fingerprint[]> {
  return Promise.all(sources.map((s) => fingerprint(s.name, s.path)));
}

/**
 * Détection de lecture déchirée : le pipeline peut réécrire une base pendant
 * l'import. Une empreinte avant, une après — si l'une des sources d'AVANT a
 * bougé (ou disparu) dans l'ensemble d'APRÈS, on refuse en la nommant plutôt
 * que d'écrire un mélange de deux états de la base amont.
 */
export function assertUnchanged(before: readonly Fingerprint[], after: readonly Fingerprint[]): void {
  for (const b of before) {
    const a = after.find((x) => x.name === b.name);
    if (a === undefined || a.mtimeMs !== b.mtimeMs || a.size !== b.size) {
      throw new Error(`la source ${b.name} a changé pendant l'import (${b.path}) — import abandonné`);
    }
  }
}
