/**
 * Text fixtures. A branch matrix like the photos: a logbook entry with its
 * ruled-line fields, a dated "Ma vie" passage, a passage placed only by its
 * page (so `date` is null and `pageSpanSource` carries the nuance), a
 * `carried` page window — an inference on an inference — a web passage with
 * neither date nor page, a corrected passage, and one marked `needs_review`.
 */
import type { TextDocument, TextPage, TextUnit } from '../../src/api/contract/text';
import { parseIsoDate, parseIsoTimestamp } from '../../src/shared/date_interface';
import {
  CorrectionStatus, DateKind, DatePrecision, DateSource, PageSpanSource,
  TextKind, TranscriptionConfidence,
} from '../../src/shared/enums';

const reading = (day: string) => ({
  start: parseIsoDate(day),
  end: parseIsoDate(day),
  precision: DatePrecision.DAY,
  kind: DateKind.READING,
  source: DateSource.LOG_ENTRY_DATE,
  bracketHours: null,
});

const passageDate = (day: string) => ({
  ...reading(day),
  source: DateSource.PASSAGE_DATE_FROM,
});

export const INVARIANT_DOCUMENTS: readonly TextDocument[] = [
  {
    id: 'logbook', kind: 'handwritten', title: 'Journal de bord',
    pageCount: 51, passageCount: 492, span: null, hasPages: true,
  },
  {
    id: 'ma-vie', kind: 'handwritten', title: 'Ma vie',
    pageCount: 104, passageCount: 798, span: null, hasPages: true,
  },
  {
    // No date at all, and it is not invented. Spec §4.2 rule C.
    id: 'web/2003/2003_gal_1', kind: 'html', title: 'Galerie 2003',
    pageCount: null, passageCount: 12, span: null, hasPages: false,
  },
];

export const INVARIANT_PAGES: readonly TextPage[] = [
  {
    id: 'logbook/p003', documentId: 'logbook', ordinal: 3, label: 'p003',
    width: 810, height: 1250,
    window: { ...reading('1999-12-08'), end: parseIsoDate('1999-12-12'),
              precision: DatePrecision.DAY, source: DateSource.PAGE_WINDOW },
    spanSource: PageSpanSource.ENTRIES,
    imageUrl: '/pages/image?pageId=logbook/p003',
    regionsAvailable: false,
  },
  {
    // `carried`: this page names no day and takes the previous one's.
    id: 'ma-vie/p007', documentId: 'ma-vie', ordinal: 7, label: 'p007',
    width: 810, height: 1250,
    window: { ...passageDate('1999-09-23'), end: parseIsoDate('1999-09-25'),
              source: DateSource.PAGE_WINDOW },
    spanSource: PageSpanSource.CARRIED,
    imageUrl: '/pages/image?pageId=ma-vie/p007',
    regionsAvailable: false,
  },
];

export const INVARIANT_TEXTS: readonly TextUnit[] = [
  {
    ref: { kind: TextKind.LOG_ENTRY, id: 'logbook/p003/001' },
    documentId: 'logbook', pageId: 'logbook/p003', ordinal: 1,
    text: 'Mouillage devant Porlamar, vent d’est 15 nœuds.',
    textOriginal: 'Mouillage devant Porlamar, vent d’est 15 noeuds.',
    correction: {
      ref: { kind: TextKind.LOG_ENTRY, id: 'logbook/p003/001' },
      text: 'Mouillage devant Porlamar, vent d’est 15 nœuds.',
      originalAtCorrection: 'Mouillage devant Porlamar, vent d’est 15 noeuds.',
      correctedAt: parseIsoTimestamp('2026-08-29T09:00:00.000Z'),
      status: CorrectionStatus.APPLIED,
    },
    confidence: TranscriptionConfidence.TRANSCRIBED,
    date: reading('1999-12-08'),
    pageSpanSource: PageSpanSource.ENTRIES,
    overlappingPhotoCount: 3,
    highlights: [],
    logEntry: {
      time: '14:30', lat: 10.95, lon: -63.85, rawPosition: '10.57.0N 63.51.0W',
      placeName: null, heading: '270', wind: 'E 15', baro: 1013,
      engineHours: null,
      fixConfidence: TranscriptionConfidence.TRANSCRIBED,
      remarkConfidence: TranscriptionConfidence.TRANSCRIBED,
    },
  },
  {
    // Same id string, different table: the collision the contract warns about.
    ref: { kind: TextKind.PASSAGE, id: 'logbook/p003/001' },
    documentId: 'logbook', pageId: 'logbook/p003', ordinal: 1,
    text: 'On a passé la nuit à réparer la pompe de cale.',
    textOriginal: 'On a passé la nuit à réparer la pompe de cale.',
    correction: null,
    confidence: TranscriptionConfidence.UNCERTAIN,
    // Placed only by its page: it asserts no day of its own.
    date: null,
    pageSpanSource: PageSpanSource.ENTRIES,
    overlappingPhotoCount: 11,
    highlights: [],
    logEntry: null,
  },
  {
    ref: { kind: TextKind.PASSAGE, id: 'ma-vie/p007/002' },
    documentId: 'ma-vie', pageId: 'ma-vie/p007', ordinal: 2,
    text: 'La transat commence vraiment ce matin.',
    textOriginal: 'La transat commence vraiment ce matin.',
    correction: null,
    confidence: TranscriptionConfidence.REVIEWED,
    date: passageDate('1999-09-23'),
    pageSpanSource: PageSpanSource.CARRIED,
    overlappingPhotoCount: 5,
    highlights: [],
    logEntry: null,
  },
  {
    // A correction whose upstream text moved: kept and flagged, never applied
    // in silence and never deleted. Q3, default (a).
    ref: { kind: TextKind.PASSAGE, id: 'ma-vie/p007/003' },
    documentId: 'ma-vie', pageId: 'ma-vie/p007', ordinal: 3,
    text: 'Gaëtan prend le quart de nuit.',
    textOriginal: 'Gaetan prend le quart de nuit.',
    correction: {
      ref: { kind: TextKind.PASSAGE, id: 'ma-vie/p007/003' },
      text: 'Gaëtan prend le quart de nuit.',
      originalAtCorrection: 'Gaetan prend le quart.',
      correctedAt: parseIsoTimestamp('2026-08-20T09:00:00.000Z'),
      status: CorrectionStatus.NEEDS_REVIEW,
    },
    confidence: TranscriptionConfidence.TRANSCRIBED,
    date: null,
    pageSpanSource: PageSpanSource.CARRIED,
    overlappingPhotoCount: 0,
    highlights: [],
    logEntry: null,
  },
  {
    // The web: no date, no page. The facing panel is explicitly empty.
    ref: { kind: TextKind.PASSAGE, id: 'web/2003/2003_gal_1/001' },
    documentId: 'web/2003/2003_gal_1', pageId: null, ordinal: 1,
    text: 'Mardi 4 Novembre, ca y’est Funfun2 flotte sous un coucher de soleil.',
    textOriginal: 'Mardi 4 Novembre, ca y’est Funfun2 flotte sous un coucher de soleil.',
    correction: null,
    confidence: TranscriptionConfidence.TRANSCRIBED,
    date: null,
    pageSpanSource: null,
    overlappingPhotoCount: 0,
    highlights: [],
    logEntry: null,
  },
] as const;
