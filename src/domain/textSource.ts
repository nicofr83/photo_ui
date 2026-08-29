import type { TextDocument } from '../api/contract/text';

/**
 * Spec §5.3: THREE sources, three sections — never one section per document.
 * There are 62 documents but only three sources: the logbook, "Ma vie", and
 * the web site's 60 HTML files. They have neither the same date granularity
 * nor the same standing, and that is what the sections keep apart.
 */
export const TextSource = {
  LOGBOOK: 'logbook',
  MA_VIE: 'ma-vie',
  WEB: 'web',
} as const;
export type TextSource = (typeof TextSource)[keyof typeof TextSource];

export const TEXT_SOURCE_TITLES: Record<TextSource, string> = {
  [TextSource.LOGBOOK]: 'Journal de bord',
  [TextSource.MA_VIE]: 'Ma vie',
  [TextSource.WEB]: 'Site web',
};

/** The document id carries the source: `logbook`, `ma-vie`, `web/2003/…`. */
export function sourceOf(documentId: string): TextSource {
  if (documentId === TextSource.LOGBOOK) return TextSource.LOGBOOK;
  if (documentId === TextSource.MA_VIE) return TextSource.MA_VIE;
  return TextSource.WEB;
}

export function groupBySource(
  documents: readonly TextDocument[],
): ReadonlyArray<{ source: TextSource; title: string; documents: TextDocument[] }> {
  return Object.values(TextSource).map((source) => ({
    source,
    title: TEXT_SOURCE_TITLES[source],
    documents: documents.filter((document) => sourceOf(document.id) === source),
  }));
}
