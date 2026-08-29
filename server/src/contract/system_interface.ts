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
}
