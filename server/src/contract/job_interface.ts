import type { TextKind } from '@shared/enums';

/**
 * Transcrit de `docs/api-contract.md` §2.9, avec UN correctif :
 * `orphanedTextSelections` y porte `{ taskSlug, textId }`, sans `textKind` —
 * ce qui contredit la règle du contrat lui-même juste au-dessus de `TextRef`
 * (« la clé d'un texte est le COUPLE, jamais l'id seul »). `app.task_text` est
 * clé sur `(task_slug, text_kind, text_id)` ; sans `textKind`, un rapport
 * d'orphelin ne peut pas dire LEQUEL de deux textes qui collisionnent (456
 * paires) a perdu son texte amont. Signalé à `contrat-api`/`front` — ceci est
 * un sur-ensemble, pas un renommage, en attendant que le contrat gelé soit
 * corrigé.
 */
export interface ImportReport {
  readonly importId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly photos: number;
  readonly albums: number;
  readonly passages: number;
  readonly logEntries: number;
  readonly annotationsRead: number;
  readonly orphanedImageSelections: readonly { readonly taskSlug: string; readonly cloudAssetId: string }[];
  readonly orphanedTextSelections: readonly {
    readonly taskSlug: string; readonly textKind: TextKind; readonly textId: string;
  }[];
  readonly correctionsNeedingReview: readonly { readonly kind: TextKind; readonly id: string }[];
  readonly cascade: {
    readonly datedToDay: number;
    readonly datedToMonth: number;
    readonly datedToYear: number;
    readonly undated: number;
    readonly byRank: Readonly<Record<string, number>>;
  };
}
