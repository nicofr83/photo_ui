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
