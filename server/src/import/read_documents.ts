import type { DatabaseSync } from 'node:sqlite';

import { normalizeNfc } from './nfc.ts';

export interface RawDocument {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly pageCount: number | null;
  /** Dérivé ici par une sous-requête EXISTS : pas de colonne amont pour ça. */
  readonly hasPages: boolean;
}

export interface RawPage {
  readonly id: string;
  readonly documentId: string;
  readonly ordinal: number;
  readonly label: string | null;
  readonly imagePath: string;
  readonly width: number;
  readonly height: number;
  /**
   * Déjà résolues en amont — mesuré sur `documents.db` : `startAt`/`endAt`/
   * `spanSource` portent directement les valeurs de `pipeline.page.window_*`
   * et `span_source` (`'passages' | 'entries' | 'carried'`, ou NULL sur les
   * quelques pages sans fenêtre calculable). Ce lecteur ne recalcule rien.
   */
  readonly startAt: string | null;
  readonly endAt: string | null;
  readonly spanSource: string | null;
}

export interface RawPassage {
  readonly id: string;
  readonly documentId: string;
  readonly pageId: string | null;
  readonly ordinal: number;
  readonly text: string;
  /** Un jour, jamais un intervalle — `pipeline.text_unit` l'exige (D11). */
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly confidence: string;
}

export interface RawLogEntry {
  readonly id: string;
  readonly pageId: string;
  readonly seq: number;
  readonly date: string;
  readonly time: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly rawPosition: string | null;
  readonly placeName: string | null;
  readonly heading: string | null;
  readonly wind: string | null;
  readonly baro: number | null;
  readonly engineHours: number | null;
  readonly remark: string | null;
  readonly fixConfidence: string;
  readonly remarkConfidence: string;
}

function* rows<T>(db: DatabaseSync, sql: string): Generator<T> {
  for (const row of db.prepare(sql).iterate()) {
    yield normalizeNfc(row as unknown as T);
  }
}

export function* readDocuments(db: DatabaseSync): Generator<RawDocument> {
  const stmt = db.prepare(`
    SELECT d.id AS id, d.kind AS kind, d.title AS title, d.pageCount AS pageCount,
           EXISTS(SELECT 1 FROM pages p WHERE p.documentId = d.id) AS hasPages
      FROM documents d`);
  for (const row of stmt.iterate()) {
    const raw = row as unknown as Omit<RawDocument, 'hasPages'> & { hasPages: number };
    yield normalizeNfc({ ...raw, hasPages: raw.hasPages === 1 });
  }
}

export function readPages(db: DatabaseSync): Generator<RawPage> {
  return rows<RawPage>(db, `
    SELECT id, documentId, ordinal, label, imagePath, width, height, startAt, endAt, spanSource
      FROM pages`);
}

export function readPassages(db: DatabaseSync): Generator<RawPassage> {
  return rows<RawPassage>(db, `
    SELECT id, documentId, pageId, ordinal, text, dateFrom, dateTo, confidence FROM passages`);
}

export function readLogEntries(db: DatabaseSync): Generator<RawLogEntry> {
  return rows<RawLogEntry>(db, `
    SELECT id, pageId, seq, date, time, latitude, longitude, rawPosition, placeName,
           heading, wind, baro, engineHours, remark, fixConfidence, remarkConfidence
      FROM log_entries`);
}
