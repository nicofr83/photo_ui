import { createHash } from 'node:crypto';

/**
 * Ce qui QUITTE la tâche à l'export (manifeste, tâche 18) — jamais un
 * horodatage : `exported_stale` en dépend entièrement (`state === 'exported_stale'
 * ⟺ contentHash !== exportedContentHash`), donc un horodatage dans le hash
 * rendrait la staleness permanente. L'exclusion est STRUCTURELLE — ces champs
 * n'existent nulle part dans le type, pas un filtre qu'on pourrait oublier.
 */
export interface TaskContentImage {
  readonly cloudAssetId: string;
  readonly order: number;
  readonly note: string | null;
  readonly selectedBecause: readonly string[];
}

export interface TaskContentTextRef {
  readonly kind: string;
  readonly id: string;
}

export interface TaskContentText {
  readonly ref: TaskContentTextRef;
  readonly order: number;
  readonly startOffset: number | null;
  readonly endOffset: number | null;
}

export interface TaskContentNote {
  readonly title: string;
  readonly text: string;
  readonly attachedToImages: readonly string[];
  readonly attachedToTexts: readonly TaskContentTextRef[];
}

export interface TaskContent {
  readonly title: string;
  readonly brief: string;
  readonly period: { readonly from: string; readonly to: string } | null;
  readonly images: readonly TaskContentImage[];
  readonly texts: readonly TaskContentText[];
  readonly notes: readonly TaskContentNote[];
}

const refKey = (ref: TaskContentTextRef): string => `${ref.kind}/${ref.id}`;

/**
 * Seul le contenu compte : l'ORDRE des tableaux `images`/`texts`/`notes` est
 * signifiant (§ « la tâche 18 test » — le manifeste est ce que lit le LLM),
 * mais `selectedBecause` et les listes de rattachement d'une note sont des
 * ENSEMBLES côté Postgres — sans ordre garanti — donc triés avant hachage.
 */
export function contentHash(task: TaskContent): string {
  const canonical = {
    title: task.title,
    brief: task.brief,
    period: task.period,
    images: task.images.map((image) => ({
      cloudAssetId: image.cloudAssetId,
      order: image.order,
      note: image.note,
      selectedBecause: [...image.selectedBecause].sort(),
    })),
    texts: task.texts.map((text) => ({
      ref: text.ref, order: text.order, startOffset: text.startOffset, endOffset: text.endOffset,
    })),
    notes: task.notes.map((note) => ({
      title: note.title,
      text: note.text,
      attachedToImages: [...note.attachedToImages].sort(),
      attachedToTexts: [...note.attachedToTexts].map(refKey).sort(),
    })),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
