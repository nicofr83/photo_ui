/** Transcrit de `docs/api-contract.md` §2.10. */
export interface RootStatus {
  readonly name: 'originals' | 'thumbs' | 'pages' | 'tasks' | 'render_cache';
  readonly envVar: string;
  readonly path: string;
  readonly available: boolean;
  readonly checkedAt: string;
}

export interface SystemStatus {
  /** Change à chaque import réussi. NULL si aucun n'a jamais tourné. */
  readonly importId: string | null;
  readonly importedAt: string | null;
  readonly runningJobId: string | null;

  /**
   * À l'usage des agents et de l'équipe, jamais montré à Nicolas (V1.6,
   * hors périmètre — l'écran a déjà `importedAt`, sa propre question).
   * Calculé UNE FOIS au démarrage : `sha` dit sur quel commit CETTE
   * instance a démarré, jamais ce qui tourne « en ce moment » — un commit
   * fait après coup ne s'y reflète pas tant que le process n'est pas
   * relancé, comparer à `git log -1` révèle l'écart. `dirty` est une
   * information (l'arbre a des changements non commités, l'état normal en
   * développement), jamais une alerte. `null` si git est indisponible.
   */
  readonly commit: { readonly sha: string; readonly dirty: boolean } | null;

  readonly roots: readonly RootStatus[];
  readonly counts: {
    readonly photosInHierarchy: number;
    readonly photosOutOfHierarchy: number;
    readonly albums: number;
    readonly documents: number;
    readonly passages: number;
    readonly logEntries: number;
  };
  /** Pré-construction des rendus — aucune passe n'existe encore : toujours à zéro pour l'instant. */
  readonly prerender: {
    readonly total: number;
    readonly done: number;
    readonly running: boolean;
  };
  /** La passe de légendage — aucune passe n'existe encore : toujours à zéro pour l'instant. */
  readonly captions: {
    readonly total: number;
    readonly done: number;
    readonly edited: number;
    readonly running: boolean;
  };
  /**
   * Ce que l'utilisateur doit voir sans le chercher — UN SEUL bandeau global
   * (contrat §9). Le compte des écartés par le filtre courant n'est PAS ici :
   * il est par requête, dans `ListEnvelope.excludedCount`.
   */
  readonly attention: {
    readonly orphanedSelections: number;
    readonly correctionsNeedingReview: number;
    readonly correctionsOrphaned: number;
    /** Les ~25 albums à plage présumée, cf. `ref.album_span`. */
    readonly albumsWithPresumedSpan: number;
    readonly webDocumentsWithoutSpan: number;
  };
  readonly features: {
    /** Export d'annotations de datation (§8.1) — désactivé par défaut. */
    readonly datingExport: boolean;
  };
}
