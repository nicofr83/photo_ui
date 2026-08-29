import type { DatePrecision, DateKind, DateSource, PositionSource } from '@shared/enums';
import type { FieldMatch, TextRange } from './filter_interface.ts';

/** Transcrit de `docs/api-contract.md` §2.2, §2.5. */
export interface ResolvedDate {
  readonly start: string;
  readonly end: string;
  readonly precision: DatePrecision;
  readonly kind: DateKind;
  readonly source: DateSource;
  readonly bracketHours: number | null;
}

export interface ResolvedPosition {
  readonly lat: number;
  readonly lon: number;
  readonly kind: DateKind;
  readonly source: PositionSource;
}

export interface DateArbitration {
  readonly exifDate: string;
  readonly gapMonths: number;
  readonly outcome: 'accepted' | 'rejected';
}

export interface CaptionExcerpt {
  readonly text: string;
  readonly highlights: readonly TextRange[];
}

export interface PhotoPlace {
  readonly city: string | null;
  readonly state: string | null;
  readonly country: string | null;
  readonly countryRaw: string | null;
  readonly sublocation: string | null;
}

export interface PhotoListItem {
  readonly cloudAssetId: string;
  readonly sha256: string;
  readonly date: ResolvedDate | null;
  readonly arbitration: DateArbitration | null;
  readonly rawDateSource: string;
  readonly captureDateLocal: string | null;
  readonly captureOffsetMin: number | null;
  readonly captureDateRaw: string | null;
  readonly position: ResolvedPosition | null;
  readonly place: PhotoPlace;
  readonly albumPath: string | null;
  readonly groupName: string | null;
  readonly fileName: string;
  readonly format: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly aestheticsScore: number | null;
  readonly people: readonly string[];
  readonly inTaskSlugs: readonly string[];
  readonly matchedOn: readonly FieldMatch[];
  readonly hasCaption: boolean;
  readonly captionExcerpt: CaptionExcerpt | null;
  readonly thumbUrl: string;
  readonly renderUrl: string;
}

export interface PhotoExif {
  readonly cameraMake: string | null;
  readonly cameraModel: string | null;
  readonly lens: string | null;
  readonly iso: number | null;
  readonly aperture: number | null;
  readonly shutter: string | null;
  readonly focalLength: number | null;
  readonly altitude: number | null;
}

export interface PhotoTag {
  readonly name: string;
  readonly confidence: number | null;
}

export interface DoubtCandidate {
  readonly place: string;
  readonly range: { readonly from: string; readonly to: string };
  readonly fixes: number;
}

export interface DatingDoubt {
  readonly reason: string;
  readonly label: string | null;
  readonly albumPath: string;
  readonly candidates: readonly DoubtCandidate[];
}

export interface DatingProposal {
  readonly date: ResolvedDate;
  readonly position: ResolvedPosition | null;
  readonly evidenceEntryIds: readonly string[];
}

export interface RenderAvailability {
  readonly available: boolean;
  readonly unavailableReason: 'VOLUME_UNAVAILABLE' | 'SOURCE_FILE_MISSING' | 'NOT_RENDERABLE' | null;
  readonly cached: boolean;
}

export interface MachineCaption {
  readonly text: string;
  readonly keywords: readonly string[];
  readonly kind: string;
  readonly editedText: string | null;
  readonly editedKeywords: readonly string[] | null;
}

export interface PhotoDetail extends PhotoListItem {
  readonly albumPaths: readonly string[];
  readonly tags: readonly PhotoTag[];
  readonly exif: PhotoExif;
  readonly ocrText: string | null;
  readonly fileSize: number | null;
  readonly relativePath: string;
  readonly proposal: DatingProposal | null;
  readonly doubt: DatingDoubt | null;
  readonly overlappingTextCount: number;
  readonly caption: MachineCaption | null;
  readonly render: RenderAvailability;
}

/** Transcrit de `docs/api-contract.md` — l'intervalle EFFECTIVEMENT utilisé par la cascade (rang 0). */
export interface AlbumSpan {
  readonly from: string;
  readonly to: string;
  /** `false` = saisi dans `ref.album_span` · `true` = déduit du préfixe, à revoir. */
  readonly presumed: boolean;
  readonly note: string | null;
}

export interface AlbumSpanHints {
  /** Motifs `NN-NN` lus dans les noms de FICHIERS (`98-99 maison rose Lisbonne`). */
  readonly fileNamePatterns: readonly string[];
  /** La plage des `captureDate` que l'arbitrage a ÉCARTÉS — souvent des dates de scan. */
  readonly rejectedExifRange: { readonly from: string; readonly to: string } | null;
  readonly rejectedExifCount: number;
}

/** Un des 82 albums, tel que le filtre et l'écran de saisie des plages en ont besoin. */
export interface Album {
  readonly path: string;
  readonly setName: string | null;
  readonly albumName: string;
  readonly groupName: string | null;
  readonly photoCount: number;
  /** Ce que le PRÉFIXE du nom donne. Jamais présenté comme une date à l'utilisateur. */
  readonly prefixYear: number | null;
  readonly prefixMonth: number | null;
  readonly span: AlbumSpan;
  /** Le nom annonce une durée ou un trajet. */
  readonly suspectedRange: boolean;
  readonly hints: AlbumSpanHints;
}

export interface FacetBucket {
  readonly value: string;
  readonly count: number;
  /** Vrai pour les tags au-delà de 500 photos. L'UI ne les met pas en avant. */
  readonly tooBroad?: boolean;
}

/** Comptes CONTEXTUELS : recalculés contre le filtre courant (contrat §5.4). */
export interface PhotoFacets {
  readonly albums: readonly FacetBucket[];
  readonly tags: readonly FacetBucket[];
  readonly people: readonly FacetBucket[];
  readonly countries: readonly FacetBucket[];
  readonly cities: readonly FacetBucket[];
  readonly years: readonly FacetBucket[];
  /** Photos du résultat courant qui portent une position. 0 ⇒ l'axe lieu est désactivé, avec sa raison. */
  readonly positionedCount: number;
  readonly withOcrCount: number;
  readonly datedToDayCount: number;
}

export type AlbumSpanWarning =
  | { readonly code: 'outside_prefix_year'; readonly prefixYear: number }
  | { readonly code: 'overlaps_album'; readonly albumPath: string };

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
