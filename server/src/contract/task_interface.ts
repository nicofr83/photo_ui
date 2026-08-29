import type { SelectionReason, TaskState } from '@shared/enums';

/** Transcrit de `docs/api-contract.md` §7. */
export interface TaskPeriod {
  readonly from: string;
  readonly to: string;
}

export interface TaskSummary {
  readonly slug: string;
  readonly title: string;
  readonly period: TaskPeriod | null;
  readonly imageCount: number;
  readonly textCount: number;
  readonly noteCount: number;
  /** Sélections dont la photo a disparu de l'index. Marquées, jamais supprimées. */
  readonly orphanCount: number;
  readonly state: TaskState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string | null;
  readonly exportedAt: string | null;
  readonly exportDirectory: string | null;
  readonly contentHash: string;
  readonly exportedContentHash: string | null;
}

export interface TaskTextRef {
  readonly kind: string;
  readonly id: string;
}

export interface TaskImageSelection {
  readonly cloudAssetId: string;
  readonly order: number;
  readonly note: string | null;
  readonly selectedBecause: readonly SelectionReason[];
  readonly selectedAt: string;
  readonly orphaned: boolean;
  readonly outOfPeriod: boolean;
}

export interface TaskTextSelection {
  readonly ref: TaskTextRef;
  readonly order: number;
  readonly selectedAt: string;
  readonly orphaned: boolean;
  readonly startOffset: number | null;
  readonly endOffset: number | null;
}

export interface TaskNote {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attachedTo: {
    readonly images: readonly string[];
    readonly texts: readonly TaskTextRef[];
  };
}

export interface TaskDetail extends TaskSummary {
  readonly brief: string;
  readonly images: readonly TaskImageSelection[];
  readonly texts: readonly TaskTextSelection[];
  readonly notes: readonly TaskNote[];
}

export interface TaskCreateInput {
  readonly title: string;
  readonly slug: string;
  readonly brief: string;
  readonly period: TaskPeriod | null;
}

export interface TaskPatchInput {
  readonly title?: string;
  readonly brief?: string;
  readonly period?: TaskPeriod | null;
}

/**
 * Une seule mutation transactionnelle (contrat §7.2) : sélectionner un album
 * de 286 photos est UN geste HTTP, pas 286 — mais l'enregistrement fait bien
 * une ligne par photo.
 */
export interface TaskImagesMutation {
  readonly add?: readonly {
    readonly cloudAssetId: string;
    readonly selectedBecause: readonly SelectionReason[];
    readonly note?: string;
  }[];
  readonly remove?: readonly string[];
  readonly update?: readonly {
    readonly cloudAssetId: string;
    readonly note?: string | null;
    readonly order?: number;
  }[];
}

export interface TaskImagesMutationResult {
  readonly added: number;
  /** Déjà sélectionnées : `selectedBecause` FUSIONNÉ, jamais rejeté. */
  readonly merged: number;
  readonly removed: number;
  readonly updated: number;
  /** Sélectionnées IMPLICITEMENT par un `update` (écrire une note retient la photo) — jamais silencieux. */
  readonly implicitlyAdded: readonly string[];
  readonly rejected: readonly { readonly cloudAssetId: string; readonly reason: 'unknown_photo' | 'not_selected' }[];
  /** ACCEPTÉ avec réserve — un avertissement n'est pas un rejet. */
  readonly warnings: readonly { readonly cloudAssetId: string; readonly code: 'out_of_period' | 'orphaned' }[];
  readonly imageCount: number;
  readonly contentHash: string;
  readonly state: TaskState;
}

/** Contrat §7.4. */
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
  /** Absente du dossier ET du manifeste — nommée ici avec sa cause. Jamais un manifeste qui référence un fichier absent. */
  readonly skippedImages: readonly {
    readonly cloudAssetId: string;
    readonly reason: 'SOURCE_FILE_MISSING' | 'NOT_RENDERABLE' | 'VOLUME_UNAVAILABLE';
    readonly expectedPath: string | null;
  }[];
  /** Disque plein : arrêt, rapport, dossier partiel signalé. */
  readonly partial: boolean;
  readonly exportedAt: string;
}
