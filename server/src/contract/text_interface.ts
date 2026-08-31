import type { CorrectionStatus, PageSpanSource, TranscriptionConfidence } from '@shared/enums';
import type { TextRange } from './filter_interface.ts';
import type { FacetBucket, ResolvedDate } from './photo_interface.ts';

export interface TextRef {
  readonly kind: string;
  readonly id: string;
}

export interface TextDocument {
  readonly id: string;
  readonly kind: 'handwritten' | 'html';
  readonly title: string;
  readonly pageCount: number | null;
  readonly passageCount: number;
  readonly span: ResolvedDate | null;
  readonly hasPages: boolean;
}

export interface TextPage {
  readonly id: string;
  readonly documentId: string;
  readonly ordinal: number;
  readonly label: string | null;
  readonly width: number;
  readonly height: number;
  readonly window: ResolvedDate | null;
  readonly spanSource: PageSpanSource | null;
  /**
   * La date de la page elle-même (v1.5, cascade registre → notes →
   * héritage, `app.page_date`) — `kind: 'reading'` quand la page l'affirme
   * (registre ou notes), `kind: 'inference'` quand elle est héritée de la
   * page précédente. Distincte de `window` : `window` est la fenêtre de
   * RECOUVREMENT calculée par la pipeline amont, `date` est ce que LA PAGE
   * dit d'elle-même. `null` seulement pour une page antérieure à la
   * première page datée de son document.
   */
  readonly date: ResolvedDate | null;
  readonly imageUrl: string;
  readonly regionsAvailable: false;
  /**
   * Le nombre de textes de la page qui correspondent à `q` (v1.5, Task 14)
   * — `null` sauf quand `q` est présent, comme `TextUnit.highlights`.
   */
  readonly matchCount: number | null;
}

export interface LogEntryFields {
  readonly time: string | null;
  readonly lat: number | null;
  readonly lon: number | null;
  readonly rawPosition: string | null;
  readonly placeName: string | null;
  readonly heading: string | null;
  readonly wind: string | null;
  readonly baro: number | null;
  readonly engineHours: number | null;
  readonly fixConfidence: TranscriptionConfidence;
  readonly remarkConfidence: TranscriptionConfidence;
}

/** Un jour seul (D11) — `start` et `end` sont toujours égaux, mais la paire reste explicite pour rester au format des autres bornes du contrat. */
export interface SingleDayRange {
  readonly start: string;
  readonly end: string;
}

export interface TextCorrection {
  readonly ref: TextRef;
  readonly text: string;
  readonly originalAtCorrection: string;
  readonly correctedAt: string;
  readonly status: CorrectionStatus;
  /**
   * La date corrigée (V1.6) — `null` quand seul le texte a été corrigé.
   * Corriger une date, c'est ARBITRER entre la lecture et ce que Nicolas
   * sait : la seule source de nature `decision` est `annotation`, la même
   * que pour les photos (`dateKind.ts`, front).
   */
  readonly date: SingleDayRange | null;
  /**
   * Le TÉMOIN — la lecture amont telle qu'elle était au moment de corriger,
   * comme `originalAtCorrection` pour le texte. `null` : soit aucune date
   * n'a été corrigée, soit le texte n'avait originellement aucune date —
   * une correction qui EN AJOUTE une ne détruit rien à préserver.
   */
  readonly originalDateAtCorrection: SingleDayRange | null;
}

export interface OverlapInfo {
  readonly rule: string;
  readonly photoSpanDays: number;
  readonly textSpanDays: number;
  readonly totalSpanDays: number;
  readonly distanceToCentreDays: number;
}

/** « 87 photos dans une fenêtre de 41 jours, dont 34 datées au mois seulement. » */
export interface OverlapSummary {
  readonly matchCount: number;
  readonly windowDays: number;
  readonly datedToDayCount: number;
  readonly datedToMonthCount: number;
  readonly datedToYearCount: number;
  readonly undatedCount: number;
}

/**
 * Une légende du site 2003-2004, appariée à sa photo par hash perceptuel
 * (contrat §11 Q11), jamais par date — 227 liens réels dans `app.web_gallery_link`
 * aujourd'hui. `verified` distingue une relecture humaine d'un appariement
 * machine tel quel ; jamais effacé par un recalcul de hash (`gallery_repository.ts`).
 */
export interface GalleryCaptionFields {
  readonly sha256: string;
  readonly page: string;
  readonly imagePath: string;
  readonly distance: number;
  readonly margin: number;
  readonly verified: boolean;
}

export interface TextUnit {
  readonly ref: TextRef;
  readonly documentId: string;
  readonly pageId: string | null;
  readonly ordinal: number;
  readonly text: string;
  readonly textOriginal: string;
  readonly correction: TextCorrection | null;
  readonly confidence: TranscriptionConfidence;
  /**
   * La date EFFECTIVE (V1.6) — corrigée si elle l'a été (`kind: 'decision'`,
   * `source: 'annotation'`), sinon la lecture amont. Même paire que
   * `text`/`textOriginal` : `dateOriginal` ci-dessous reste TOUJOURS la
   * lecture, jamais la correction.
   */
  readonly date: ResolvedDate | null;
  /** La lecture amont, TOUJOURS — jamais la correction, même quand `date` en porte une. */
  readonly dateOriginal: ResolvedDate | null;
  readonly pageSpanSource: PageSpanSource | null;
  readonly overlappingPhotoCount: number;
  readonly highlights: readonly TextRange[];
  readonly logEntry: LogEntryFields | null;
  /** `null` pour tout ce qui n'est pas `kind: 'web_caption'` — jamais un champ absent. */
  readonly galleryCaption: GalleryCaptionFields | null;
}

export interface TextWithOverlap extends TextUnit {
  readonly overlap: OverlapInfo;
}

/**
 * Ce que suggèrent les photos liées par appariement de galerie
 * (`app.web_gallery_link`) — une SUGGESTION affichée, jamais saisie dans
 * `ref.web_span` : `proposal` et `span` (ci-dessous) sont deux champs
 * INDÉPENDANTS, l'un ne remplit jamais l'autre (v1.5, Task 10).
 * `datedToDayCount < photoCount` dit que la proposition est fragile — une
 * partie de ce qui la soutient n'est datée qu'au mois ou à l'année.
 */
export interface WebDateProposal {
  readonly date: string;
  readonly photoCount: number;
  readonly datedToDayCount: number;
  readonly spanDays: number;
}

export interface WebDocumentRow {
  readonly documentId: string;
  readonly title: string;
  readonly passageCount: number;
  /** Un extrait pour reconnaître le document — aucun de ses passages n'est daté. */
  readonly excerpt: string;
  readonly span: ResolvedDate | null;
  /** Le chemin du document est le seul indice de date. Présenté comme tel. */
  readonly pathHint: string;
  /** `null` quand aucune photo n'est liée à ce document — jamais une date inventée. */
  readonly proposal: WebDateProposal | null;
}

/**
 * `GET /texts/facets?documentId=…` (v1.5, Task 13) — année, mois, jour,
 * chacun ce que la donnée contient RÉELLEMENT : « Ma vie » ne propose qu'une
 * année et quatre mois, jamais les douze. `Bucket.count` est un compte de
 * TEXTES, jamais de jours — le même `FacetBucket` que `PhotoFacets`, une
 * seule forme de bucket dans tout le contrat.
 */
export interface TextDateFacets {
  readonly years: readonly FacetBucket[];
  readonly months: readonly FacetBucket[];
  readonly days: readonly FacetBucket[];
}
