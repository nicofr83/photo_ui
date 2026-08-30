/**
 * Text fixtures. A branch matrix like the photos: a logbook entry with its
 * ruled-line fields, a dated "Ma vie" passage, a passage placed only by its
 * page (so `date` is null and `pageSpanSource` carries the nuance), a
 * `carried` page window — an inference on an inference — a web passage with
 * neither date nor page, a corrected passage, and one marked `needs_review`.
 */
import type { TextDocument, TextFacets, TextPage, TextUnit } from '../../src/api/contract/text';
import type { WebDateProposal } from '../../src/api/contract/ref';
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
  // v1.5, Task 12 — web-dating screen fixtures.
  {
    // A strong proposal: 20 photos, all dated to the day, a 9-day span.
    id: 'web/2003/2003_gal_15', kind: 'html', title: 'Galerie 15',
    pageCount: null, passageCount: 5, span: null, hasPages: false,
  },
  {
    // A weak proposal: one photo, dated only to the month.
    id: 'web/photo', kind: 'html', title: 'Une photo', pageCount: null,
    passageCount: 2, span: null, hasPages: false,
  },
  {
    // Already dated (a saved web_span — always an inference, contract §4.8).
    id: 'web/1999/Transat', kind: 'html', title: 'Transat', pageCount: null,
    passageCount: 10,
    span: {
      start: parseIsoDate('1999-11-05'), end: parseIsoDate('1999-11-08'),
      precision: DatePrecision.DAY, kind: DateKind.INFERENCE, source: DateSource.WEB_SPAN,
      bracketHours: null,
    },
    hasPages: false,
  },
  {
    // A rebut: one passage only, under the "at least two" threshold (contract
    // §4.8) — outside the perimeter, reachable only behind "Voir tout".
    id: 'web/googlea0ccc7e24963cc5e', kind: 'html', title: 'Vérification Google',
    pageCount: null, passageCount: 1, span: null, hasPages: false,
  },
];

/**
 * v1.5, Task 12: `WebDocumentRow.proposal` fixtures — synthesized by the
 * mock handler for `GET /ref/web-documents`, never a field `TextDocument`
 * itself carries (contract: the row is a JOIN of the document, an excerpt,
 * and this).
 */
export const INVARIANT_WEB_PROPOSALS: Record<string, WebDateProposal> = {
  'web/2003/2003_gal_15': {
    date: parseIsoDate('2004-10-05'), photoCount: 20, datedToDayCount: 20, spanDays: 9,
  },
  'web/photo': {
    date: parseIsoDate('2000-06-15'), photoCount: 1, datedToDayCount: 0, spanDays: 30,
  },
};

export const INVARIANT_PAGES: readonly TextPage[] = [
  {
    // v1.5, Task 8: earlier ordinal (1) than 'ma-vie/p007' above but exists
    // independently — carries its OWN reading date, so the "propre" half of
    // the reading/inference pair the sort-toggle test needs.
    id: 'ma-vie/p001', documentId: 'ma-vie', ordinal: 1, label: 'p001',
    width: 870, height: 1226,
    window: { ...passageDate('1999-08-04'), kind: DateKind.INFERENCE, source: DateSource.PAGE_WINDOW },
    date: { ...passageDate('1999-08-04'), kind: DateKind.READING, source: DateSource.PAGE_DATE },
    matchCount: null,
    spanSource: PageSpanSource.PASSAGES,
    imageUrl: '/pages/image?pageId=ma-vie/p001',
    regionsAvailable: false,
  },
  {
    // Names no day of its own — inherits p001's, an inference on a reading.
    id: 'ma-vie/p002', documentId: 'ma-vie', ordinal: 2, label: 'p002',
    width: 870, height: 1226,
    window: { ...passageDate('1999-08-04'), kind: DateKind.INFERENCE, source: DateSource.PAGE_WINDOW },
    date: { ...passageDate('1999-08-04'), kind: DateKind.INFERENCE, source: DateSource.PAGE_DATE },
    matchCount: null,
    spanSource: PageSpanSource.CARRIED,
    imageUrl: '/pages/image?pageId=ma-vie/p002',
    regionsAvailable: false,
  },
  {
    // v1.5, Task 8: an EARLIER date than 'logbook/p003' below despite a
    // HIGHER ordinal — the sort-toggle test needs chronological order and
    // notebook order to disagree on these two pages, same as the real
    // corpus (a scan can be filed out of temporal sequence).
    id: 'logbook/p005', documentId: 'logbook', ordinal: 5, label: 'p005',
    width: 810, height: 1250,
    window: { ...reading('1999-11-01'), end: parseIsoDate('1999-11-01'),
              precision: DatePrecision.DAY, kind: DateKind.INFERENCE,
              source: DateSource.PAGE_WINDOW },
    date: { ...reading('1999-11-01'), source: DateSource.PAGE_DATE },
    matchCount: null,
    spanSource: PageSpanSource.ENTRIES,
    imageUrl: '/pages/image?pageId=logbook/p005',
    regionsAvailable: false,
  },
  {
    // v1.5, Task 9: `label: null` so `PageViewer`'s alt falls back to the
    // ordinal ("Page 10") — the test looks for that exact accessible name.
    id: 'logbook/p010', documentId: 'logbook', ordinal: 10, label: null,
    width: 810, height: 1250,
    window: { ...reading('2000-01-02'), end: parseIsoDate('2000-01-02'),
              precision: DatePrecision.DAY, kind: DateKind.INFERENCE,
              source: DateSource.PAGE_WINDOW },
    date: { ...reading('2000-01-02'), source: DateSource.PAGE_DATE },
    matchCount: null,
    spanSource: PageSpanSource.ENTRIES,
    imageUrl: '/pages/image?pageId=logbook%2Fp010',
    regionsAvailable: false,
  },
  {
    // v1.5, Task 8 (self-review): a register window over 60 days — spec
    // "Douze pages du registre couvrent plus de soixante jours... un signe
    // discret dans la liste" — a likely-misread transcription year, flagged
    // (never corrected here; that is a transcription task, not a display one).
    id: 'logbook/p006', documentId: 'logbook', ordinal: 6, label: 'p006',
    width: 810, height: 1250,
    window: { ...reading('1999-05-01'), end: parseIsoDate('1999-08-15'),
              precision: DatePrecision.DAY, kind: DateKind.INFERENCE,
              source: DateSource.PAGE_WINDOW },
    date: { ...reading('1999-05-01'), source: DateSource.PAGE_DATE },
    matchCount: null,
    spanSource: PageSpanSource.ENTRIES,
    imageUrl: '/pages/image?pageId=logbook%2Fp006',
    regionsAvailable: false,
  },
  {
    // v1.5, Task 9: "Ma vie" has no register — a single block, no title.
    id: 'ma-vie/p003', documentId: 'ma-vie', ordinal: 3, label: 'p003',
    width: 870, height: 1226,
    window: { ...passageDate('1999-08-06'), kind: DateKind.INFERENCE, source: DateSource.PAGE_WINDOW },
    date: { ...passageDate('1999-08-06'), kind: DateKind.READING, source: DateSource.PAGE_DATE },
    matchCount: null,
    spanSource: PageSpanSource.PASSAGES,
    imageUrl: '/pages/image?pageId=ma-vie%2Fp003',
    regionsAvailable: false,
  },
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
  {
    // v1.5, Task 9: the register half of the ruled-line/notes-libres split —
    // same id string as the passage below, different table (same collision
    // pattern as logbook/p003/001 above).
    ref: { kind: TextKind.LOG_ENTRY, id: 'logbook/p010/011' },
    documentId: 'logbook', pageId: 'logbook/p010', ordinal: 11,
    text: 'Route au 090, mouillage prévu à Bequia ce soir.',
    textOriginal: 'Route au 090, mouillage prévu à Bequia ce soir.',
    correction: null,
    confidence: TranscriptionConfidence.TRANSCRIBED,
    date: reading('2000-01-02'),
    pageSpanSource: PageSpanSource.ENTRIES,
    overlappingPhotoCount: 2,
    highlights: [],
    logEntry: {
      time: '08:00', lat: 12.98, lon: -61.25, rawPosition: '12.59.0N 61.15.0W',
      placeName: null, heading: '090', wind: 'NE 12', baro: 1015,
      engineHours: null,
      fixConfidence: TranscriptionConfidence.TRANSCRIBED,
      remarkConfidence: TranscriptionConfidence.TRANSCRIBED,
    },
    galleryCaption: null,
  },
  {
    // The notes-libres half: a billet collé, never dating the page (spec).
    ref: { kind: TextKind.PASSAGE, id: 'logbook/p010/011' },
    documentId: 'logbook', pageId: 'logbook/p010', ordinal: 11,
    text: 'Un billet du musée de Bequia, collé en souvenir.',
    textOriginal: 'Un billet du musée de Bequia, collé en souvenir.',
    correction: null,
    confidence: TranscriptionConfidence.TRANSCRIBED,
    date: null,
    pageSpanSource: PageSpanSource.ENTRIES,
    overlappingPhotoCount: 0,
    highlights: [],
    logEntry: null,
    galleryCaption: null,
  },
  {
    // v1.5, Task 9: "Ma vie" has no register — this is the ONLY block on its
    // page, and PageDetail must not title it "Registre".
    ref: { kind: TextKind.PASSAGE, id: 'ma-vie/p003/001' },
    documentId: 'ma-vie', pageId: 'ma-vie/p003', ordinal: 1,
    text: 'Le mouillage de Bequia est calme ce soir.',
    textOriginal: 'Le mouillage de Bequia est calme ce soir.',
    correction: null,
    confidence: TranscriptionConfidence.TRANSCRIBED,
    date: passageDate('1999-08-06'),
    pageSpanSource: PageSpanSource.PASSAGES,
    overlappingPhotoCount: 4,
    highlights: [],
    logEntry: null,
    galleryCaption: null,
  },
] as const;

/**
 * v1.5, Task 10: `GET /texts/facets?documentId=…` fixtures. Real numbers,
 * not the tiny `INVARIANT_TEXTS` array's own count — same convention as
 * `INVARIANT_DOCUMENTS.passageCount` above, a representative corpus size,
 * not `.length`. `logbook`'s years sum to 151 (492 − 151 = 341) and
 * `ma-vie`'s to 677 (798 − 677 = 121) — the exact undated counts the spec
 * itself names ("341 dans le journal, 121 dans « Ma vie »"), independently
 * confirmed against the real corpus by `back` (ETAT-TRAVAUX.md, Task 13).
 */
export const INVARIANT_TEXT_FACETS: Record<string, TextFacets> = {
  logbook: {
    years: [
      { value: '1998', count: 42 }, { value: '1999', count: 38 },
      { value: '2000', count: 31 }, { value: '2001', count: 26 },
      { value: '2002', count: 14 },
    ],
    months: [{ value: '1998-07', count: 12 }, { value: '1998-08', count: 15 }],
    days: [{ value: '1998-07-08', count: 2 }, { value: '1998-07-09', count: 1 }],
  },
  'ma-vie': {
    years: [{ value: '1999', count: 677 }],
    months: [
      { value: '1999-08', count: 210 }, { value: '1999-09', count: 198 },
      { value: '1999-10', count: 175 }, { value: '1999-11', count: 94 },
    ],
    days: [{ value: '1999-08-04', count: 3 }, { value: '1999-09-23', count: 2 }],
  },
};
