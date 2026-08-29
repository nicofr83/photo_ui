import type { DatabaseSync } from 'node:sqlite';

import { normalizeNfc } from './nfc.ts';

export interface RawOcr {
  readonly sha256: string;
  readonly text: string;
}

/**
 * `mcp-content.db ocr` — texte IMPRIMÉ dans l'image (enseigne, écran de
 * navigation), clé sur `sha256` : c'est le CONTENU qui porte l'OCR, pas la
 * ligne d'index. `lang`, `blocks`, `createdAt` ne servent à rien en aval.
 */
export function* readOcr(db: DatabaseSync): Generator<RawOcr> {
  for (const row of db.prepare(`SELECT sha256, text FROM ocr`).iterate()) {
    yield normalizeNfc(row as unknown as RawOcr);
  }
}
