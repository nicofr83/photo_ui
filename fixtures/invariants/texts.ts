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
    // A page window is an INFERENCE (dateKind.ts: PAGE_WINDOW), never a
    // reading — `reading()` only supplies start/end/bracketHours here.
    window: { ...reading('1999-12-08'), end: parseIsoDate('1999-12-12'),
              precision: DatePrecision.DAY, kind: DateKind.INFERENCE,
              source: DateSource.PAGE_WINDOW },
    // v1.5: the page's OWN resolved date (register/notes/carried cascade),
    // distinct from `window` above — this page carries its own day, so a
    // reading (PAGE_DATE has two valid natures, dateKind.ts).
    date: { ...reading('1999-12-08'), source: DateSource.PAGE_DATE },
    matchCount: null,
    spanSource: PageSpanSource.ENTRIES,
    imageUrl: '/pages/image?pageId=logbook/p003',
    regionsAvailable: false,
  },
  {
    // `carried`: this page names no day and takes the previous one's.
    id: 'ma-vie/p007', documentId: 'ma-vie', ordinal: 7, label: 'p007',
    width: 810, height: 1250,
    window: { ...passageDate('1999-09-23'), end: parseIsoDate('1999-09-25'),
              kind: DateKind.INFERENCE, source: DateSource.PAGE_WINDOW },
    // This page names no day and takes the previous one's — an inference,
    // same reasoning as spanSource: CARRIED below.
    date: { ...passageDate('1999-09-23'), kind: DateKind.INFERENCE, source: DateSource.PAGE_DATE },
    matchCount: null,
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
    galleryCaption: null,
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
    galleryCaption: null,
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
    galleryCaption: null,
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
    galleryCaption: null,
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
    galleryCaption: null,
  },
  {
    // Gallery captions (contract §11 Q11, recommendation (a), proposed to
    // `back`): a DIRECT image match, never a date window — no date, no page,
    // same as the web passage above, but linked to a specific photo.
    ref: { kind: TextKind.WEB_CAPTION, id: 'web/2003/2003_gal_1/caption/000a86651c47' },
    documentId: 'web/2003/2003_gal_1', pageId: null, ordinal: 2,
    text: 'Les ruines mayas de Tikal, au petit matin.',
    textOriginal: 'Les ruines mayas de Tikal, au petit matin.',
    correction: null,
    confidence: TranscriptionConfidence.TRANSCRIBED,
    date: null,
    pageSpanSource: null,
    // The one directly-matched photo. Never a count of many: see
    // GALLERY_MATCH in mocks/handlers.ts.
    overlappingPhotoCount: 1,
    highlights: [],
    logEntry: null,
    galleryCaption: {
      sha256: '000a86651c4788e727de62d6fc893f21341f4c2173b1d6e6d80a1ca402e81333',
      page: '2003/2003_gal_11.htm',
      imagePath: '2003/images/tikal01.jpg',
      distance: 2,
      margin: 9,
      verified: true,
    },
  },
  {
    // Unverified: below the review pass, rendered as a supposition — same
    // register as `carried`, never confused with a verified match.
    ref: { kind: TextKind.WEB_CAPTION, id: 'web/2003/2003_gal_1/caption/000b44bd55d0' },
    documentId: 'web/2003/2003_gal_1', pageId: null, ordinal: 3,
    text: 'Sorel et Beaufort, escale avant Fort Lauderdale.',
    textOriginal: 'Sorel et Beaufort, escale avant Fort Lauderdale.',
    correction: null,
    confidence: TranscriptionConfidence.TRANSCRIBED,
    date: null,
    pageSpanSource: null,
    overlappingPhotoCount: 1,
    highlights: [],
    logEntry: null,
    galleryCaption: {
      sha256: '000b44bd55d0c913520cbf1800c02af776853770d2f4ba85b0761209cdb99214',
      page: '2003/2003_gal_11.htm',
      imagePath: '2003/images/sorel03.jpg',
      distance: 5,
      margin: 3,
      verified: false,
    },
  },
] as const;
