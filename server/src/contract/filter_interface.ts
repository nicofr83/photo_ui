import type { MatchField } from '@shared/enums';

/**
 * Transcrit de `docs/api-contract.md` §2.4. Les valeurs codées viennent du
 * module partagé ; seules les FORMES sont redéclarées ici.
 */

/**
 * Enveloppe de TOUTE liste filtrée. « Un total et une page sont deux choses » :
 * `total` est le compte du filtre, `items.length` celui du transport.
 */
export interface ListEnvelope<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly populationTotal: number;
  /** `populationTotal - total`. Redondant, et c'est voulu : l'écran l'affiche tel quel. */
  readonly excludedCount: number;
  readonly filters: FilterReport;
  readonly importId: string;
}

/** Ce qui a réellement été appliqué. Aucun filtre ne disparaît en silence. */
export interface FilterReport {
  readonly applied: readonly AppliedFilter[];
  /**
   * Valeurs d'un vocabulaire OUVERT qui n'existent pas dans les données. Ce
   * n'est pas une erreur : elles restreignent à zéro, et ça se voit.
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
