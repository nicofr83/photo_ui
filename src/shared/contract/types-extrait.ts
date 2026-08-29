// Types du contrat photo_ui — EXTRAIT AUTOMATIQUE de docs/api-contract.md
//
// Ce fichier est une COMMODITÉ DE LECTURE pour les agents d'implémentation :
// il rassemble les blocs TypeScript du contrat, sans la prose qui les entoure.
//
// LA SOURCE DE VÉRITÉ RESTE docs/api-contract.md. En cas de doute, ou pour
// comprendre POURQUOI un type est fait ainsi, ouvrir le contrat — notamment
// ses amendements datés en tête, et ses règles de comportement (filtres,
// erreurs, natures) que le typage seul ne porte pas.
//
// Régénérer : python3 tools/extract-contract-types.py


// ─── 2.1 `enums.ts` ──────────────────────────────────────────────

// packages/shared/src/enums.ts

/** Précision de CHAQUE BORNE, pas largeur de l'intervalle. Voir §2.2. */
export const DatePrecision = {
  DAY: 'day',
  MONTH: 'month',
  YEAR: 'year',
} as const;
export type DatePrecision = (typeof DatePrecision)[keyof typeof DatePrecision];

/** La règle capitale : lecture · proposition · décision humaine. */
export const DateKind = {
  READING: 'reading',
  INFERENCE: 'inference',
  DECISION: 'decision',
} as const;
export type DateKind = (typeof DateKind)[keyof typeof DateKind];

/** D'où vient la date. Vocabulaire FERMÉ, unique pour photos et textes. */
export const DateSource = {
  // photos — les six échelons de la cascade
  ANNOTATION: 'annotation',              // rang 1  · decision
  EXIF_ARBITRATED: 'exif_arbitrated',    // rang 2  · reading
  LOGBOOK_BRACKET: 'logbook_bracket',    // rang 3  · inference
  ALBUM_MONTH: 'album_month',            // rangs 4 et 5 · inference
  ALBUM_YEAR: 'album_year',              // rang 6  · inference
  // textes
  PASSAGE_DATE_FROM: 'passage_date_from', // passages.dateFrom · reading
  LOG_ENTRY_DATE: 'log_entry_date',       // log_entries.date  · reading
  PAGE_WINDOW: 'page_window',             // pages.startAt/endAt · voir spanSource
  WEB_SPAN: 'web_span',                   // ref.web_span · INFERENCE, humaine mais conjecturale
} as const;
export type DateSource = (typeof DateSource)[keyof typeof DateSource];

/** Nature d'une position. */
export const PositionSource = {
  EXIF: 'exif',                               // reading
  LOGBOOK_INTERPOLATED: 'logbook_interpolated', // inference
} as const;
export type PositionSource = (typeof PositionSource)[keyof typeof PositionSource];

/** D'où vient la fenêtre d'une page. `carried` est une inférence : ça doit se voir. */
export const PageSpanSource = {
  PASSAGES: 'passages',
  ENTRIES: 'entries',
  CARRIED: 'carried',
} as const;
export type PageSpanSource = (typeof PageSpanSource)[keyof typeof PageSpanSource];

/** Les trois règles de recouvrement. */
export const OverlapRule = {
  LOGBOOK_ENTRY: 'logbook_entry', // règle A
  PASSAGE: 'passage',             // règle B
  WEB_SPAN: 'web_span',           // règle C — n'existe que si ref.web_span est saisi
} as const;
export type OverlapRule = (typeof OverlapRule)[keyof typeof OverlapRule];

/**
 * L'espace de noms d'un texte. Il fait PARTIE DE SA CLÉ : 456 identifiants
 * existent à la fois dans `passages` et dans `log_entries`. Voir §2.6.
 */
export const TextKind = { PASSAGE: 'passage', LOG_ENTRY: 'log_entry' } as const;
export type TextKind = (typeof TextKind)[keyof typeof TextKind];

/** État d'une correction de transcription vis-à-vis du texte amont actuel. */
export const CorrectionStatus = {
  APPLIED: 'applied',           // le texte d'origine n'a pas bougé
  NEEDS_REVIEW: 'needs_review', // il a bougé : conservée, marquée, jamais appliquée en silence
  ORPHANED: 'orphaned',         // la cible n'existe plus du tout dans `pipeline`
} as const;
export type CorrectionStatus = (typeof CorrectionStatus)[keyof typeof CorrectionStatus];

/** Nature d'une légende. Une machine n'écrit pas un souvenir. */
export const CaptionKind = {
  MACHINE: 'machine',
  HUMAN_EDITED: 'human-edited',
} as const;
export type CaptionKind = (typeof CaptionKind)[keyof typeof CaptionKind];

/** documents.confidence, tel quel. */
export const TranscriptionConfidence = {
  TRANSCRIBED: 'transcribed',
  REVIEWED: 'reviewed',
  UNCERTAIN: 'uncertain',
} as const;
export type TranscriptionConfidence =
  (typeof TranscriptionConfidence)[keyof typeof TranscriptionConfidence];

/** Périmètre de la population de travail. Explicite, jamais implicite. */
export const PhotoScope = {
  HIERARCHY: 'hierarchy',               // les 82 albums — 3 930 photos, défaut
  OUT_OF_HIERARCHY: 'out_of_hierarchy', // les fourre-tout racine — 373
  ALL: 'all',                           // 4 303
} as const;
export type PhotoScope = (typeof PhotoScope)[keyof typeof PhotoScope];

export const PhotoSort = {
  DATE_ASC: 'date_asc',   // défaut
  DATE_DESC: 'date_desc',
  AESTHETICS_DESC: 'aesthetics_desc',
  ALBUM: 'album',         // albumPath puis nom de fichier
  OVERLAP: 'overlap',     // somme des largeurs croissante — n'a de sens qu'avec overlapsText
} as const;
export type PhotoSort = (typeof PhotoSort)[keyof typeof PhotoSort];

/** Champ qui a répondu à un axe textuel. « On ratisse large, on ne raconte pas large. » */
export const MatchField = {
  ALBUM_PATH: 'album_path',
  GROUP_NAME: 'group_name',
  PLACE_CITY: 'place_city',
  PLACE_COUNTRY: 'place_country',
  PLACE_STATE: 'place_state',
  PLACE_SUBLOCATION: 'place_sublocation',
  PERSON: 'person',
  TAG: 'tag',
  OCR: 'ocr',                        // texte IMPRIMÉ dans l'image
  CAPTION: 'caption',                // phrase de légende
  CAPTION_KEYWORD: 'caption_keyword',
  FILE_NAME: 'file_name',
} as const;
export type MatchField = (typeof MatchField)[keyof typeof MatchField];

/** Pourquoi une image a été retenue. Voir Q3. */
export const SelectionReason = {
  MANUAL: 'manual',
  DATE_RANGE: 'date_range',
  ALBUM: 'album',
  TAG: 'tag',
  PERSON: 'person',
  PLACE: 'place',
  TEXT_OVERLAP: 'text_overlap',
  SEARCH: 'search',
} as const;
export type SelectionReason = (typeof SelectionReason)[keyof typeof SelectionReason];

export const TaskState = {
  DRAFT: 'draft',
  EXPORTED: 'exported',
  EXPORTED_STALE: 'exported_stale', // exportée, modifiée depuis
} as const;
export type TaskState = (typeof TaskState)[keyof typeof TaskState];

export const JobType = {
  IMPORT: 'import',
  EXPORT: 'export',
  PRERENDER: 'prerender',
  CAPTION: 'caption',              // déclenchée par l'utilisateur, ne bloque rien
  DATING_EXPORT: 'dating_export',  // drapeau désactivé par défaut
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

export const JobState = {
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;
export type JobState = (typeof JobState)[keyof typeof JobState];

/** Largeur du rendu à la demande. Vocabulaire FERMÉ : une valeur inconnue est un 400. */
export const RenderEdge = { DETAIL: 1400 } as const;
export type RenderEdge = (typeof RenderEdge)[keyof typeof RenderEdge];

export const ErrorCode = {
  UNKNOWN_PARAMETER: 'UNKNOWN_PARAMETER',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  NOT_FOUND: 'NOT_FOUND',
  SLUG_TAKEN: 'SLUG_TAKEN',
  TARGET_DIRECTORY_EXISTS: 'TARGET_DIRECTORY_EXISTS',
  EMPTY_CORRECTION: 'EMPTY_CORRECTION',
  VOLUME_UNAVAILABLE: 'VOLUME_UNAVAILABLE',
  SOURCE_FILE_MISSING: 'SOURCE_FILE_MISSING',
  NOT_RENDERABLE: 'NOT_RENDERABLE',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  IMPORT_IN_PROGRESS: 'IMPORT_IN_PROGRESS',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];


// ─── 2.2 `date_interface.ts` — le cœur du contrat ────────────────

// packages/shared/src/date_interface.ts
import type { DateKind, DatePrecision, DateSource, PositionSource } from './enums';

/**
 * Jour civil `YYYY-MM-DD`. AUCUN fuseau, AUCUNE heure, JAMAIS d'UTC.
 * Type marqué : une chaîne littérale ne peut pas s'y assigner sans passer par
 * `parseIsoDate`. C'est ce qui empêche un `date: string` de réapparaître.
 */
export type IsoDate = string & { readonly __isoDate: unique symbol };

/** Instant réel, ISO-8601 UTC avec `Z`. Créations, exports, imports — jamais une prise de vue. */
export type IsoTimestamp = string & { readonly __isoTimestamp: unique symbol };

/**
 * Horodatage LOCAL naïf `YYYY-MM-DDTHH:MM[:SS]`, sans fuseau. Un `captureDate`
 * amont a six formats et 76 % n'ont aucune zone ; le chemin du fichier sur
 * disque dérive de l'heure telle qu'elle est stockée. On ne convertit jamais.
 */
export type LocalDateTime = string & { readonly __localDateTime: unique symbol };

/**
 * Ce que le système AFFIRME sur la date d'une chose.
 *
 * `precision` qualifie CHAQUE BORNE, pas la largeur de l'intervalle :
 *   photo « octobre 1999 »   → [1999-10-01, 1999-10-31] precision 'month'
 *   passage sur fenêtre 3 j  → [1999-09-23, 1999-09-25] precision 'day'
 * La largeur se calcule (`end - start + 1`) et voyage explicitement dans les
 * résultats de recouvrement.
 */
export interface ResolvedDate {
  /** Toujours présentes toutes les deux, même égales. */
  readonly start: IsoDate;
  readonly end: IsoDate;
  readonly precision: DatePrecision;
  readonly kind: DateKind;
  readonly source: DateSource;
  /** Fourchette de la proposition (rang 3). NULL partout ailleurs. Sans elle : « sans fourchette », jamais un nombre non soutenu. */
  readonly bracketHours: number | null;
}

/** Position, avec sa nature. Même règle que la date. */
export interface ResolvedPosition {
  readonly lat: number;   // degrés décimaux signés
  readonly lon: number;
  readonly kind: DateKind;         // reading (exif) | inference (interpolée)
  readonly source: PositionSource;
}

/**
 * L'arbitrage EXIF ↔ album, rendu constatable.
 * `outcome: 'accepted'` = rang 2 · `'rejected'` = rang 4 (l'EXIF est une date
 * de scan) · absence de ce bloc = rang 5 (pas d'EXIF du tout).
 * Permet à l'interface de dire « EXIF, confirmé à 2 mois du mois d'album ».
 */
export interface DateArbitration {
  readonly exifDate: LocalDateTime;
  readonly gapMonths: number;
  readonly outcome: 'accepted' | 'rejected';
}

/**
 * Ce que l'HUMAIN déclare. Pas de `kind`, pas de `source` : le serveur les pose.
 * C'est la traduction en types de « date_kind dérivé jamais saisi ».
 */
export interface HumanDateInput {
  readonly start: IsoDate;
  readonly end: IsoDate;
  readonly precision: DatePrecision;
}

/** Ce que l'utilisateur DEMANDE (filtre) ou DÉCLARE (période d'une tâche). Une question n'est pas une affirmation. */
export interface CivilDayRange {
  readonly from: IsoDate;
  readonly to: IsoDate;
}

export function parseIsoDate(raw: string): IsoDate;          // lève sur format invalide
export function parseIsoTimestamp(raw: string): IsoTimestamp;


// ─── 2.3 `error_interface.ts` ────────────────────────────────────

// packages/shared/src/error_interface.ts
import type { ErrorCode } from './enums';

export interface ApiError {
  readonly error: ApiErrorBody;
}

export type ApiErrorBody =
  | { readonly code: 'UNKNOWN_PARAMETER'; readonly message: string;
      readonly details: { readonly parameters: readonly string[];
                          readonly accepted: readonly string[] } }
  | { readonly code: 'INVALID_PARAMETER'; readonly message: string;
      readonly details: { readonly parameter: string; readonly received: string;
                          readonly accepted: readonly string[] | null } }
  | { readonly code: 'NOT_FOUND'; readonly message: string;
      readonly details: { readonly resource: string; readonly id: string } }
  | { readonly code: 'SLUG_TAKEN'; readonly message: string;
      readonly details: { readonly slug: string; readonly existingTaskTitle: string } }
  | { readonly code: 'TARGET_DIRECTORY_EXISTS'; readonly message: string;
      readonly details: { readonly directory: string } }
  | { readonly code: 'EMPTY_CORRECTION'; readonly message: string;
      readonly details: { readonly targetId: string } }
  | { readonly code: 'VOLUME_UNAVAILABLE'; readonly message: string;
      readonly details: { readonly root: string; readonly envVar: string } }
  | { readonly code: 'SOURCE_FILE_MISSING'; readonly message: string;
      readonly details: { readonly cloudAssetId: string; readonly expectedPath: string } }
  | { readonly code: 'NOT_RENDERABLE'; readonly message: string;
      readonly details: { readonly cloudAssetId: string; readonly format: string } }
  | { readonly code: 'FEATURE_DISABLED'; readonly message: string;
      readonly details: { readonly feature: string; readonly envVar: string } }
  | { readonly code: 'IMPORT_IN_PROGRESS'; readonly message: string;
      readonly details: { readonly jobId: string } }
  | { readonly code: 'INTERNAL'; readonly message: string;
      readonly details: { readonly traceId: string } };


// ─── 2.4 `filter_interface.ts` ───────────────────────────────────

// packages/shared/src/filter_interface.ts
import type { MatchField } from './enums';

/**
 * Enveloppe de TOUTE liste filtrée.
 * « Un total et une page sont deux choses » : `total` est le compte du filtre,
 * `items.length` celui du transport.
 */
export interface ListEnvelope<T> {
  readonly items: readonly T[];
  /** Nombre d'éléments correspondant au filtre, indépendamment de limit/offset. */
  readonly total: number;
  /** Taille de la population avant filtrage, dans le `scope` demandé. */
  readonly populationTotal: number;
  /** `populationTotal - total`. Redondant, et c'est voulu : l'écran l'affiche tel quel. */
  readonly excludedCount: number;
  readonly filters: FilterReport;
  /** Identifiant de l'import qui a produit ces données. Voir §9. */
  readonly importId: string;
}

/** Ce qui a réellement été appliqué. Aucun filtre ne disparaît en silence. */
export interface FilterReport {
  readonly applied: readonly AppliedFilter[];
  /**
   * Valeurs d'un vocabulaire OUVERT qui n'existent pas dans les données.
   * Elles ne sont pas une erreur : elles restreignent à zéro, et ça se voit.
   */
  readonly unmatchedValues: readonly UnmatchedFilterValue[];
}

export interface AppliedFilter {
  readonly parameter: string;
  readonly values: readonly string[];
  /** Vrai quand la lecture généreuse a élargi le champ de recherche. */
  readonly broadened: boolean;
}

export interface UnmatchedFilterValue {
  readonly parameter: string;
  readonly value: string;
  /** Valeurs proches, pour proposer une correction. Vide si aucune. */
  readonly nearest: readonly string[];
}

/** Portion de texte à mettre en évidence. Offsets en UNITÉS UTF-16, sémantique JS. */
export interface TextRange {
  readonly start: number;
  readonly length: number;
}

/** Quel champ a répondu, sur un axe qui cherche dans plusieurs colonnes. */
export interface FieldMatch {
  readonly field: MatchField;
  readonly value: string;
}


// ─── 2.5 `photo_interface.ts` ────────────────────────────────────

// packages/shared/src/photo_interface.ts
import type { DateArbitration, IsoDate, LocalDateTime, ResolvedDate,
              ResolvedPosition } from './date_interface';
import type { CaptionKind } from './enums';
import type { FieldMatch, TextRange } from './filter_interface';

/** 32 hex minuscules. L'identité stable d'une photo. */
export type CloudAssetId = string & { readonly __cloudAssetId: unique symbol };
/** 64 hex minuscules. L'identité du CONTENU et donc de la vignette. */
export type Sha256 = string & { readonly __sha256: unique symbol };

/** L'élément de grille. Tout ce que « Sélection d'images » affiche sans ouvrir le détail. */
export interface PhotoListItem {
  readonly cloudAssetId: CloudAssetId;
  readonly sha256: Sha256;

  /**
   * NULL possible : la cascade est totale sur les 3 930 du périmètre, mais 420
   * photos de la photothèque n'ont aucune date et Q5 autorise le hors-périmètre
   * dans une tâche. La grille affiche « sans date » ; le tri les groupe à la fin.
   */
  readonly date: ResolvedDate | null;
  /** Rang 2 (accepted) ou rang 4 (rejected). NULL au rang 5 et hors cascade EXIF. */
  readonly arbitration: DateArbitration | null;
  /** Ce que le pipeline disait avant la cascade. Le désaccord doit rester constatable. */
  readonly rawDateSource: string;     // photos.dateSource : 7 valeurs, vocabulaire amont
  readonly captureDateLocal: LocalDateTime | null;
  readonly captureOffsetMin: number | null;
  readonly captureDateRaw: string | null;

  readonly position: ResolvedPosition | null;
  readonly place: PhotoPlace;

  readonly albumPath: string | null;   // album principal, NFC
  readonly groupName: string | null;
  readonly fileName: string;           // basename, sans le chemin absolu
  readonly format: string;             // 'jpg' | 'tif' | 'png' | …
  readonly width: number | null;
  readonly height: number | null;
  readonly aestheticsScore: number | null;
  readonly people: readonly string[];

  /** Slugs des tâches où cette photo est déjà retenue. Information, pas interdiction. */
  readonly inTaskSlugs: readonly string[];

  /** Quel champ a répondu au filtre. Vide quand aucun axe généreux n'était actif. */
  readonly matchedOn: readonly FieldMatch[];

  /** La photo porte une légende. La légende elle-même n'est servie qu'au détail. */
  readonly hasCaption: boolean;
  /**
   * L'extrait de légende qui a répondu à `q`, surligné. NULL si `q` est absent
   * ou si c'est un autre champ qui a répondu. Sans cet extrait, l'utilisateur
   * ne peut pas juger pourquoi une photo remonte ni apprendre le vocabulaire
   * que le modèle emploie.
   */
  readonly captionExcerpt: CaptionExcerpt | null;

  readonly thumbUrl: string;   // `/images/${sha256}/thumb`
  readonly renderUrl: string;  // `/images/${sha256}/render?edge=1400`
}

export interface CaptionExcerpt {
  readonly text: string;
  readonly highlights: readonly TextRange[];   // offsets UTF-16 dans `text`
}

/** Chaque champ nullable indépendamment : ville sans pays existe, et l'inverse aussi. */
export interface PhotoPlace {
  readonly city: string | null;
  readonly state: string | null;
  readonly country: string | null;          // libellé normalisé via ref
  readonly countryRaw: string | null;       // tel qu'Adobe l'a écrit
  readonly sublocation: string | null;
}

/** Le panneau de détail. Hérite de tout l'item de liste. */
export interface PhotoDetail extends PhotoListItem {
  readonly albumPaths: readonly string[];   // l'appartenance est multiple : 2 à 4 albums
  readonly tags: readonly PhotoTag[];
  readonly exif: PhotoExif;
  readonly ocrText: string | null;          // texte IMPRIMÉ dans l'image, pas une légende
  readonly fileSize: number | null;
  /** Chemin relatif à la racine des originaux. Jamais absolu : le volume est déplaçable. */
  readonly relativePath: string;

  /** Champs de PREMIER NIVEAU, jamais fondus dans la date. */
  readonly proposal: DatingProposal | null;
  readonly doubt: DatingDoubt | null;

  readonly overlappingTextCount: number;
  /** La légende complète, avec ses mots-clés. NULL tant que la passe n'a pas couvert cette photo. */
  readonly caption: MachineCaption | null;

  /**
   * **Sans ce champ, la règle des trois échecs est intenable côté client.**
   * Le `onerror` d'un `<img>` est opaque : il ne dit pas si le volume est
   * démonté (global, bandeau, export bloqué), si le fichier de CETTE photo
   * manque, ou si le format ne peut produire aucun pixel. Le client consulte ce
   * bloc AVANT de pointer une image sur `renderUrl`.
   */
  readonly render: RenderAvailability;
}

export interface RenderAvailability {
  readonly available: boolean;
  /** NULL si `available`. Sinon la cause, et une seule. */
  readonly unavailableReason:
    | 'VOLUME_UNAVAILABLE'    // configuration, global
    | 'SOURCE_FILE_MISSING'   // cette photo
    | 'NOT_RENDERABLE'        // cette photo
    | null;
  /** Déjà en cache : le panneau affiche sans attendre `sips`. */
  readonly cached: boolean;
}

export interface PhotoTag {
  readonly name: string;
  /** 48–98 pour un tag `ai`, NULL pour un mot-clé `user`. NULL n'écarte jamais un tag. */
  readonly confidence: number | null;
}

export interface PhotoExif {
  readonly cameraMake: string | null;
  readonly cameraModel: string | null;
  readonly lens: string | null;
  readonly iso: number | null;
  readonly aperture: number | null;
  readonly shutter: string | null;      // chaîne amont : « 1/35 ». Pas un nombre.
  readonly focalLength: number | null;
  readonly altitude: number | null;     // mètres
}

/** Rang 3 de la cascade. La fourchette et les preuves voyagent avec. */
export interface DatingProposal {
  readonly date: ResolvedDate;
  readonly position: ResolvedPosition | null;
  /** Ids de `log_entries` : un clic ouvre la page de journal. */
  readonly evidenceEntryIds: readonly string[];
}

/** Le motif de l'absence de proposition. Une ligne absente ne dit rien sans sa raison. */
export interface DatingDoubt {
  /** Vocabulaire OUVERT — donnée, pas énumération. Voir `GET /vocabularies/doubt-reasons`. */
  readonly reason: string;
  readonly label: string | null;        // libellé français depuis `ref`, si connu
  readonly albumPath: string;
  readonly candidates: readonly DoubtCandidate[];
}

export interface DoubtCandidate {
  readonly place: string;
  readonly range: { readonly from: IsoDate; readonly to: IsoDate };
  readonly fixes: number;
}

/**
 * Légende produite par un modèle de vision. C'est un AXE DE V1 — la première
 * brique de recherche par contenu, pas une option différée.
 * Elle ne va JAMAIS dans `texts[]` (texte d'époque) ni `notes[]` (humain).
 */
export interface MachineCaption {
  /** Deux à quatre phrases, en français, factuelles. */
  readonly text: string;
  /** 5 à 10 mots-clés normalisés — l'atténuation de la synonymie du `tsvector`. */
  readonly keywords: readonly string[];
  readonly kind: CaptionKind;
  readonly model: string;
  readonly promptVersion: string;
  readonly createdAt: IsoTimestamp;
  /** La production d'origine, conservée quand l'humain corrige. Jamais détruite. */
  readonly machineOriginal: string | null;
}

export interface CaptionEditInput {
  readonly text: string;
  readonly keywords?: readonly string[];
}

/** Un des 82 albums, tel que le filtre et l'écran de saisie des plages en ont besoin. */
export interface Album {
  readonly path: string;                 // NFC. Clé de `ref.album_span`.
  readonly setName: string | null;
  readonly albumName: string;
  readonly groupName: string | null;
  readonly photoCount: number;
  /** Ce que le PRÉFIXE du nom donne. Jamais présenté comme une date à l'utilisateur. */
  readonly prefixYear: number | null;
  readonly prefixMonth: number | null;
  /** L'intervalle effectivement utilisé par la cascade. */
  readonly span: AlbumSpan;
  /** Le nom annonce une durée ou un trajet — 25 albums, 1 268 photos. */
  readonly suspectedRange: boolean;

  /**
   * Les deux indices de l'écran de réglage. Présentés COMME DES INDICES et
   * **jamais pré-remplis dans les champs de saisie** : ce sont exactement les
   * données que l'arbitrage a jugées peu fiables.
   */
  readonly hints: AlbumSpanHints;
}

export interface AlbumSpanHints {
  /** Motifs `NN-NN` lus dans les noms de FICHIERS (`98-99 maison rose Lisbonne`). 297 fichiers du périmètre. */
  readonly fileNamePatterns: readonly string[];
  /** La plage des `captureDate` que l'arbitrage a ÉCARTÉS. Souvent des dates de scan — d'où l'avertissement. */
  readonly rejectedExifRange: { readonly from: IsoDate; readonly to: IsoDate } | null;
  readonly rejectedExifCount: number;
}

export interface AlbumSpan {
  readonly from: IsoDate;
  readonly to: IsoDate;
  /** `false` = saisi dans `ref.album_span` · `true` = déduit du préfixe, à revoir. */
  readonly presumed: boolean;
  readonly note: string | null;
}

/** Comptes CONTEXTUELS : recalculés contre le filtre courant. Voir §5.4. */
export interface PhotoFacets {
  readonly albums: readonly FacetBucket[];
  readonly tags: readonly FacetBucket[];      // triés par sélectivité décroissante
  readonly people: readonly FacetBucket[];
  readonly countries: readonly FacetBucket[];
  readonly cities: readonly FacetBucket[];
  readonly years: readonly FacetBucket[];
  /** Photos du résultat courant qui portent une position. 0 ⇒ l'axe lieu est désactivé, avec sa raison. */
  readonly positionedCount: number;
  readonly withOcrCount: number;
  readonly datedToDayCount: number;
}

export interface FacetBucket {
  readonly value: string;
  readonly count: number;
  /** Vrai pour les 42 tags > 500 photos. L'UI ne les met pas en avant. */
  readonly tooBroad?: boolean;
}


// ─── 2.6 `text_interface.ts` ─────────────────────────────────────

// packages/shared/src/text_interface.ts
import type { IsoTimestamp, ResolvedDate } from './date_interface';
import type { TextRange } from './filter_interface';
import type { CorrectionStatus, PageSpanSource, TextKind,
              TranscriptionConfidence } from './enums';

/** `ma-vie/p007/002`, `logbook/p003/001`. Déjà présent dans `documents.db` — pas fabriqué ici. */
export type TextId = string & { readonly __textId: unique symbol };
export type DocumentId = string & { readonly __documentId: unique symbol }; // `logbook`, `web/1999/Transat`
export type PageId = string & { readonly __pageId: unique symbol };         // `logbook/p001`

/**
 * LA CLÉ D'UN TEXTE EST LE COUPLE, JAMAIS L'ID SEUL. *(Mesuré.)*
 *
 * `passages.id` et `log_entries.id` valent tous deux `<pageId>/<NNN>`, et
 * **456 identifiants existent dans les deux tables**. `logbook/p003/001` est à
 * la fois un passage (la prose libre du haut de page) et une entrée de journal
 * (la première ligne du tableau réglé) — deux textes différents, même chaîne.
 * Sur `logbook/p003`, `001` à `005` collisionnent intégralement.
 *
 * Conséquence directe : `TextId` n'apparaît JAMAIS seul dans une signature
 * publique. Tout ce qui désigne un texte prend un `TextRef`, et les paramètres
 * de requête vont par paires `textKind` + `textId`.
 */
export interface TextRef {
  readonly kind: TextKind;
  readonly id: TextId;
}

export interface TextDocument {
  readonly id: DocumentId;
  readonly kind: 'handwritten' | 'html';
  readonly title: string;
  readonly pageCount: number | null;   // NULL pour les 60 documents HTML
  readonly passageCount: number;
  /** Intervalle saisi dans `ref.web_span`. NULL = aucune date, et ça ne s'invente pas. */
  readonly span: ResolvedDate | null;
  /** Vrai pour les 60 HTML : « Le site web n'a pas de page », panneau vide explicite. */
  readonly hasPages: boolean;
}

export interface TextPage {
  readonly id: PageId;
  readonly documentId: DocumentId;
  readonly ordinal: number;
  readonly label: string | null;
  readonly width: number;
  readonly height: number;
  /** Fenêtre de la page. NULL sur 3 des 155. `carried` est une inférence et doit se voir. */
  readonly window: ResolvedDate | null;
  readonly spanSource: PageSpanSource | null;
  readonly imageUrl: string;           // `/pages/image?pageId=…`
  /**
   * `pages.region` est NULL sur les 155 lignes : rien ne dit où un passage se
   * trouve sur l'image. Le champ existe pour ne pas promettre ce qui n'existe pas.
   */
  readonly regionsAvailable: false;
}

/** Un passage ou une entrée de journal. Une seule forme : l'écran texte les affiche côte à côte. */
export interface TextUnit {
  /** L'identité. `ref.id` seul ne désigne rien : 456 ids sont ambigus. */
  readonly ref: TextRef;
  readonly documentId: DocumentId;
  readonly pageId: PageId | null;      // NULL pour les passages issus du HTML
  readonly ordinal: number;

  /** Le texte EFFECTIF : corrigé s'il l'a été. */
  readonly text: string;
  /** La transcription du pipeline, TOUJOURS présente. Jamais l'un sans l'autre. */
  readonly textOriginal: string;
  readonly correction: TextCorrection | null;

  readonly confidence: TranscriptionConfidence;

  /**
   * CE QUE LE TEXTE AFFIRME LUI-MÊME — et **`null` s'il n'affirme rien**.
   *
   * Un passage qui ne nomme aucun jour n'en affirme aucun. Lui donner une date
   * héritée de la fenêtre de sa page, même étiquetée `inference`, c'est lui
   * faire dire ce qu'il ne dit pas. La fenêtre existe, elle est utile, et elle
   * vit dans `overlap` — pas ici.
   *
   * *(Mesuré, sur 2 871 unités.)* **1 840 affirment un jour** — 828 passages par
   * leur `dateFrom`, 1 012 entrées de journal, toutes datées. **1 031
   * n'affirment rien** — 462 passages placés par leur page, 569 du site web.
   *
   * Conséquence : quand elle n'est pas nulle, `precision` vaut **toujours**
   * `day`, `start === end`, et `kind` vaut **toujours** `reading`. Les dates du
   * journal et de « Ma vie » sont les seules dates certaines du corpus, écrites
   * le jour même sur la page — et cette phrase de la spécification devient une
   * propriété du schéma au lieu d'une approximation.
   *
   * L'interface affiche `indéterminée`, jamais une date devinée.
   */
  readonly date: ResolvedDate | null;

  /**
   * Qualifie la fenêtre de la PAGE, celle qui sert au recouvrement — jamais la
   * date ci-dessus, qui ne vient jamais d'une page.
   *
   * **`carried` est une inférence sur une inférence** : la page ne nomme aucun
   * jour et reprend celui de la précédente. 121 des 462 passages placés par leur
   * page sont dans ce cas. La nuance ne peut pas se déduire d'une jointure côté
   * client : dans un résultat de recouvrement ou de recherche, la page n'est pas
   * chargée. NULL pour un texte sans page — les 569 du site web.
   */
  readonly pageSpanSource: PageSpanSource | null;
  readonly overlappingPhotoCount: number;

  /** Renseigné seulement par `GET /texts?q=…`. Offsets dans `text`, unités UTF-16. */
  readonly highlights: readonly TextRange[];

  /** Entrées de journal seulement : ce que la ligne réglée porte en plus du texte. */
  readonly logEntry: LogEntryFields | null;
}

export interface LogEntryFields {
  /** `HH:MM` tel qu'écrit à bord. **Fuseau inconnu et non enregistré** — ne jamais convertir. */
  readonly time: string | null;
  readonly lat: number | null;         // décimal, déjà converti par le pipeline
  readonly lon: number | null;
  /** Degrés et minutes, transcription littérale. Ne jamais reconvertir. */
  readonly rawPosition: string | null;
  /** Les 115 lignes qui en portent un sont exactement celles sans position. */
  readonly placeName: string | null;
  readonly heading: string | null;
  readonly wind: string | null;
  readonly baro: number | null;
  readonly engineHours: number | null;
  readonly fixConfidence: TranscriptionConfidence;
  readonly remarkConfidence: TranscriptionConfidence;
}

/** Globale, jamais par tâche : une erreur d'OCR est fausse dans toutes les tâches. */
export interface TextCorrection {
  readonly ref: TextRef;
  readonly text: string;
  /**
   * La transcription telle qu'elle était AU MOMENT de la correction.
   * C'est le TÉMOIN DE DÉRIVE : la clé d'un texte est positionnelle
   * (`<pageId>` + `ordinal`/`seq`), donc une re-dérivation de `documents.db`
   * qui recoupe une page décale tous les ids suivants de cette page. Seule la
   * comparaison de ce texte permet de s'en apercevoir.
   */
  readonly originalAtCorrection: string;
  readonly correctedAt: IsoTimestamp;
  /**
   * `applied` · `needs_review` (le texte amont a bougé) · `orphaned` (la cible a
   * disparu). Dans les deux derniers cas la correction est CONSERVÉE et
   * signalée — jamais appliquée en silence, jamais supprimée (Q3, défaut (a)).
   */
  readonly status: CorrectionStatus;
}

export interface TextCorrectionInput {
  readonly ref: TextRef;
  readonly text: string;   // vide ou blanc ⇒ 422 EMPTY_CORRECTION
}


// ─── 2.7 `overlap_interface.ts` ──────────────────────────────────

// packages/shared/src/overlap_interface.ts
import type { OverlapRule } from './enums';
import type { PhotoListItem } from './photo_interface';
import type { TextUnit } from './text_interface';

/**
 * On croise deux INTERVALLES, jamais un point :
 *   recouvre ⟺ photo.start ≤ texte.end ET texte.start ≤ photo.end
 * Aucun plafond de largeur : 40 % des dates de photo ne sont pas des mesures,
 * un seuil masquerait des recouvrements corrects autant que du bruit, en silence.
 */
export interface OverlapInfo {
  readonly rule: OverlapRule;
  /** Ce qu'on IGNORE de la photo. */
  readonly photoSpanDays: number;
  /** Ce que le texte COUVRE. */
  readonly textSpanDays: number;
  /** Tri par défaut : cette somme, croissante. */
  readonly totalSpanDays: number;
  /** Distance du centre de la photo au centre de la fenêtre du texte, en jours. */
  readonly distanceToCentreDays: number;
}

export interface PhotoWithOverlap extends PhotoListItem {
  readonly overlap: OverlapInfo;
}

export interface TextWithOverlap extends TextUnit {
  readonly overlap: OverlapInfo;
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


// ─── 2.8 `task_interface.ts` ─────────────────────────────────────

// packages/shared/src/task_interface.ts
import type { CivilDayRange, IsoTimestamp } from './date_interface';
import type { SelectionReason, TaskState } from './enums';
import type { CloudAssetId } from './photo_interface';
import type { TextRef } from './text_interface';

/** Dérivé du titre, MODIFIABLE À LA CRÉATION UNIQUEMENT : c'est le nom du dossier livré. */
export type TaskSlug = string & { readonly __taskSlug: unique symbol };
export type NoteId = string & { readonly __noteId: unique symbol };  // `note_01JB…`

export interface TaskSummary {
  readonly slug: TaskSlug;
  readonly title: string;
  readonly period: CivilDayRange | null;
  readonly imageCount: number;
  readonly textCount: number;
  readonly noteCount: number;
  /** Sélections dont la photo a disparu de l'index. Marquées, jamais supprimées. */
  readonly orphanCount: number;
  readonly state: TaskState;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
  readonly lastOpenedAt: IsoTimestamp | null;   // la liste ordonne dessus
  readonly exportedAt: IsoTimestamp | null;
  readonly exportDirectory: string | null;
  /**
   * Empreinte du contenu exportable, `exported_at` exclu.
   * `state === 'exported_stale'` ⟺ `contentHash !== exportedContentHash`.
   */
  readonly contentHash: string;
  readonly exportedContentHash: string | null;
}

export interface TaskDetail extends TaskSummary {
  readonly brief: string;          // la consigne libre pour le LLM
  readonly images: readonly TaskImageSelection[];
  readonly texts: readonly TaskTextSelection[];
  readonly notes: readonly TaskNote[];
}

export interface TaskImageSelection {
  readonly cloudAssetId: CloudAssetId;
  /** Ordre du manifeste — celui que le LLM lira. Chronologique par défaut, réordonnable. */
  readonly order: number;
  /** La légende qui partira avec cette image. */
  readonly note: string | null;
  /**
   * Traçabilité du GESTE, pas une propriété de la photo. ADDITIF : re-sélectionner
   * par un autre chemin ajoute une raison, n'en remplace jamais une — sinon le
   * second geste efface la trace du premier.
   */
  readonly selectedBecause: readonly SelectionReason[];
  readonly selectedAt: IsoTimestamp;
  /** La photo n'est plus dans l'index depuis le dernier import. Signalée, jamais retirée. */
  readonly orphaned: boolean;
  /** Hors de `task.period`. Autorisé, avec avertissement (Q5, défaut (b)). */
  readonly outOfPeriod: boolean;
}

export interface TaskTextSelection {
  readonly ref: TextRef;          // le COUPLE, jamais l'id seul
  readonly order: number;
  readonly selectedAt: IsoTimestamp;
  readonly orphaned: boolean;
  /** Q2 défaut (a) : passage entier. Nullables dès aujourd'hui pour que (b) ne migre rien. */
  readonly startOffset: number | null;
  readonly endOffset: number | null;
}

export interface TaskNote {
  readonly id: NoteId;
  readonly title: string;
  readonly text: string;                 // Markdown
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
  /** Vide des deux côtés = note générale, et c'est un cas courant. */
  readonly attachedTo: {
    readonly images: readonly CloudAssetId[];
    readonly texts: readonly TextRef[];
  };
}

// ---- entrées ----

export interface TaskCreateInput {
  readonly title: string;
  readonly slug: TaskSlug;
  readonly brief: string;
  readonly period: CivilDayRange | null;
}

export interface TaskPatchInput {
  readonly title?: string;
  readonly brief?: string;
  readonly period?: CivilDayRange | null;
  /** Le slug n'est PAS ici : il n'est modifiable qu'à la création. */
}

/**
 * Une seule mutation transactionnelle pour la sélection d'images.
 * Le geste sélectionne un album de 286 photos ; l'enregistrement fait une ligne
 * par photo — mais un seul aller-retour et une seule transaction.
 */
export interface TaskImagesMutation {
  readonly add?: readonly {
    readonly cloudAssetId: CloudAssetId;
    readonly selectedBecause: readonly SelectionReason[];
    readonly note?: string;
  }[];
  readonly remove?: readonly CloudAssetId[];
  readonly update?: readonly {
    readonly cloudAssetId: CloudAssetId;
    readonly note?: string | null;
    readonly order?: number;
  }[];
}

export interface TaskImagesMutationResult {
  readonly added: number;
  /** Déjà sélectionnées : leurs `selectedBecause` ont été FUSIONNÉES, pas rejetées. */
  readonly merged: number;
  readonly removed: number;
  readonly updated: number;
  /**
   * Photos qu'un `update` a sélectionnées IMPLICITEMENT — écrire une légende
   * pour une photo est le geste de la retenir. Le frontend doit le DIRE :
   * « Cette photo est maintenant retenue dans *La transat* ». Jamais silencieux.
   */
  readonly implicitlyAdded: readonly CloudAssetId[];
  /** Ce qui n'a pas pu être appliqué, nommé avec sa cause. Jamais un échec muet. */
  readonly rejected: readonly {
    readonly cloudAssetId: CloudAssetId;
    readonly reason: 'unknown_photo' | 'not_selected';
  }[];
  /**
   * ACCEPTÉ, avec réserve. Un avertissement n'est pas un rejet, et les deux se
   * rendent différemment : une photo hors 1998-2004 entre dans la tâche (Q5,
   * défaut (b) — une photo de 2005 peut légitimement conclure un récit), une
   * photo orpheline y reste et se voit.
   */
  readonly warnings: readonly {
    readonly cloudAssetId: CloudAssetId;
    readonly code: 'out_of_period' | 'orphaned';
  }[];
  readonly imageCount: number;
  readonly contentHash: string;
  readonly state: TaskState;
}

export interface TaskTextsMutation {
  readonly add?: readonly TextRef[];
  readonly remove?: readonly TextRef[];
  readonly reorder?: readonly { readonly ref: TextRef; readonly order: number }[];
}

export interface TaskExportInput {
  /** Défaut : `<TASKS_ROOT>/<slug>`. */
  readonly directory?: string;
  /** Défaut `false`. Dossier existant + `false` ⇒ 409, jamais d'écrasement silencieux. */
  readonly overwrite?: boolean;
}

export interface TaskExportReport {
  readonly directory: string;
  readonly manifestPath: string;
  readonly imagesWritten: number;
  readonly pagesWritten: number;
  readonly textsWritten: number;
  readonly notesWritten: number;
  readonly bytesWritten: number;
  /**
   * L'export CONTINUE sur une image qui ne rend pas ; elle est absente du dossier
   * ET du manifeste, et nommée ici avec sa cause. Un manifeste qui référence un
   * fichier absent est pire qu'un manifeste incomplet.
   */
  readonly skippedImages: readonly {
    readonly cloudAssetId: CloudAssetId;
    readonly reason: 'SOURCE_FILE_MISSING' | 'NOT_RENDERABLE' | 'VOLUME_UNAVAILABLE';
    readonly expectedPath: string | null;
  }[];
  /** Disque plein : arrêt, rapport, dossier partiel signalé. */
  readonly partial: boolean;
  readonly exportedAt: IsoTimestamp;
}


// ─── 2.9 `job_interface.ts` ──────────────────────────────────────

// packages/shared/src/job_interface.ts
import type { IsoTimestamp } from './date_interface';
import type { JobState, JobType } from './enums';
import type { TaskExportReport } from './task_interface';
import type { TextRef } from './text_interface';

export type JobId = string & { readonly __jobId: unique symbol };

export interface Job {
  readonly id: JobId;
  readonly type: JobType;
  readonly state: JobState;
  readonly createdAt: IsoTimestamp;
  readonly startedAt: IsoTimestamp | null;
  readonly finishedAt: IsoTimestamp | null;
  readonly progress: JobProgress;
  readonly cancellable: boolean;
  /** Renseigné à la fin. La forme dépend du `type`. */
  readonly result: JobResult | null;
  readonly error: { readonly code: string; readonly message: string } | null;
}

export interface JobProgress {
  readonly done: number;
  /** NULL tant que le total n'est pas connu — jamais 0 pour « inconnu ». */
  readonly total: number | null;
  /** Ce sur quoi le job travaille, affichable. */
  readonly label: string | null;
}

export type JobResult =
  | { readonly type: 'export'; readonly report: TaskExportReport }
  | { readonly type: 'import'; readonly report: ImportReport }
  | { readonly type: 'prerender'; readonly rendered: number; readonly failed: number }
  | { readonly type: 'caption'; readonly captioned: number; readonly failed: number;
      readonly model: string; readonly promptVersion: string }
  | { readonly type: 'dating_export'; readonly annotationsWritten: number };

/** Périmètre d'une passe de légendage : le périmètre entier, un album, ou une sélection. */
export type CaptionScope =
  | { readonly kind: 'perimeter' }
  | { readonly kind: 'album'; readonly albumPath: string }
  | { readonly kind: 'task'; readonly taskSlug: string };

export interface ImportReport {
  readonly importId: string;
  readonly startedAt: IsoTimestamp;
  readonly finishedAt: IsoTimestamp;
  readonly photos: number;
  readonly albums: number;
  readonly passages: number;
  readonly logEntries: number;
  readonly annotationsRead: number;
  /** Ce que l'import a fait au travail humain — il n'y touche pas, il le signale. */
  readonly orphanedImageSelections: readonly { readonly taskSlug: string;
                                               readonly cloudAssetId: string }[];
  readonly orphanedTextSelections: readonly { readonly taskSlug: string;
                                              readonly textId: string }[];
  readonly correctionsNeedingReview: readonly TextRef[];
  /** Répartition après cascade — l'écran de revue s'en sert. */
  readonly cascade: {
    readonly datedToDay: number;
    readonly datedToMonth: number;
    readonly datedToYear: number;
    readonly undated: number;
    readonly byRank: Readonly<Record<string, number>>;
  };
}


// ─── 2.10 `system_interface.ts` ──────────────────────────────────

// packages/shared/src/system_interface.ts
import type { IsoTimestamp } from './date_interface';
import type { JobId } from './job_interface';

/**
 * Consulté au démarrage du frontend, et pollé pendant les opérations longues.
 * C'est ici que « une donnée périmée doit se voir » devient concret.
 */
export interface SystemStatus {
  /** Change à chaque import réussi. Toute liste porte le sien : le comparer détecte un import en cours de session. */
  readonly importId: string;
  readonly importedAt: IsoTimestamp | null;   // NULL = jamais importé
  readonly runningJobId: JobId | null;

  readonly roots: readonly RootStatus[];
  readonly counts: {
    readonly photosInHierarchy: number;
    readonly photosOutOfHierarchy: number;
    readonly albums: number;
    readonly documents: number;
    readonly passages: number;
    readonly logEntries: number;
  };
  readonly prerender: {
    readonly total: number;
    readonly done: number;
    readonly running: boolean;
  };
  /** La passe de légendage. Elle ne bloque rien : ces compteurs sont informatifs. */
  readonly captions: {
    readonly total: number;      // photos du périmètre
    readonly done: number;
    readonly edited: number;     // légendes corrigées à la main
    readonly running: boolean;
  };
  /**
   * Ce que l'utilisateur doit voir sans le chercher.
   * UN SEUL bandeau global, affiché uniquement si l'un de ces compteurs est non
   * nul ; le détail vit dans l'écran de réglage et nulle part ailleurs — sinon
   * quatre bandeaux concurrents se disputent le haut de la grille.
   *
   * Le compte des ÉCARTÉS PAR LE FILTRE COURANT n'est PAS ici : il est par
   * requête et voyage dans `ListEnvelope.excludedCount`.
   */
  readonly attention: {
    readonly orphanedSelections: number;
    readonly correctionsNeedingReview: number;
    readonly correctionsOrphaned: number;
    readonly albumsWithPresumedSpan: number;   // les 25, cf. `ref.album_span`
    readonly webDocumentsWithoutSpan: number;
  };
  readonly features: {
    /** §8.1 : export d'annotations de datation. Désactivé par défaut. */
    readonly datingExport: boolean;
  };
}

export interface RootStatus {
  readonly name: 'originals' | 'thumbs' | 'pages' | 'tasks' | 'render_cache';
  readonly envVar: string;
  readonly path: string;
  readonly available: boolean;
  readonly checkedAt: IsoTimestamp;
}


// ─── 4.8 Référentiels — écran « Réglages » ───────────────────────

export interface AlbumSpanUpdateResult {
  readonly album: Album;
  /** La cascade est recalculée pour cet album SEULEMENT, dans la transaction. */
  readonly recomputed: {
    readonly photosAffected: number;
    readonly datesChanged: number;
    readonly precisionChanged: number;
  };
  /** Accepté malgré tout. Un avertissement n'est pas un refus. */
  readonly warnings: readonly AlbumSpanWarning[];
}

export type AlbumSpanWarning =
  /**
   * L'intervalle saisi ne recouvre pas l'année du préfixe de l'album.
   * ACCEPTÉ : c'est précisément le cas que la saisie existe pour traiter —
   * `1998-02-Maison rose Algès` s'étend jusqu'en juin 1999.
   */
  | { readonly code: 'outside_prefix_year'; readonly prefixYear: number }
  /** L'intervalle chevauche celui d'un autre album. Fréquent, et pas une faute. */
  | { readonly code: 'overlaps_album'; readonly albumPath: string };

export interface WebDocumentRow {
  readonly documentId: DocumentId;
  readonly title: string;
  readonly passageCount: number;
  /** Un extrait pour reconnaître le document — aucun de ses passages n'est daté. */
  readonly excerpt: string;
  readonly span: ResolvedDate | null;
  /** Le chemin du document est le seul indice de date. Présenté comme tel. */
  readonly pathHint: string;
}

export interface CountryRow {
  readonly raw: string;
  readonly normalized: string;
  readonly photoCount: number;
}


// ─── 7.3 Revue — `GET /tasks/:slug/review` ───────────────────────

export interface TaskReview {
  readonly task: TaskSummary;
  readonly images: readonly (PhotoListItem & { readonly selection: TaskImageSelection })[];
  readonly texts: readonly (TextUnit & { readonly selection: TaskTextSelection })[];
  readonly notes: readonly TaskNote[];
  /** Le bandeau de contrôle. Chaque compte est cliquable côté client. */
  readonly warnings: {
    readonly undatedImages: number;
    readonly inferredDateImages: number;
    readonly uncertainTexts: number;
    readonly textsWiderThan30Days: number;
    readonly imagesWithoutText: number;
    readonly orphanedImages: number;
    readonly orphanedTexts: number;
    readonly imagesOutOfPeriod: number;
  };
  /** La chronologie. Les bornes viennent des ResolvedDate — rien n'est aplati en un point. */
  readonly timeline: readonly {
    readonly kind: 'image' | 'text';
    readonly id: string;
    readonly start: IsoDate;
    readonly end: IsoDate;
    readonly precision: DatePrecision;
    readonly dateKind: DateKind;
  }[];
}
