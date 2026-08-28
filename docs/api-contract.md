# `photo_ui` — contrat d'API backend ↔ frontend

Dérivé de `docs/frontend-spec.md` (source de vérité), avec les schémas amont de
`docs/pipeline-inventory.md` et les coûts de `docs/pipeline-capabilities.md`.

Chaque endpoint est justifié par un écran de **« Les écrans »** ou par un besoin
écrit dans **« Besoins pour le backend »**. Ce qui n'y est pas est marqué
**PROPOSITION** avec sa raison.

**Prose en français, identifiants en anglais** — convention des documents
existants du projet.

> ## État : **GELÉ** pour la forme des types
>
> §2 — les types partagés — et §3 — le modèle d'erreur — sont **stables**.
> `impl-frontend` peut écrire son client typé contre eux.
>
> Les questions ouvertes qui restent (§11) portent toutes sur le **comportement
> du serveur**, jamais sur la forme de ce qui passe sur le fil : idempotence de
> l'export, largeurs de rendu, statut des liens de galerie. Aucune ne change une
> interface de §2.
>
> Corollaire, et il engage : **tout champ ajouté après ce gel est un changement
> de contrat annoncé**, jamais un ajout discret. Le client valide en
> `strictObject` et lèvera — c'est voulu.
>
> **Un seul ajout depuis le gel**, annoncé à `impl-frontend` :
> `TextUnit.pageSpanSource` (§2.6). Motif : la spécification exige que le
> `spanSource` d'une fenêtre accompagne le résultat, et `carried` — une
> inférence sur une inférence — doit se voir ; or il n'était disponible que sur
> `TextPage`, que le client ne charge pas dans un résultat de recouvrement ou de
> recherche. C'était un manque du contrat face à la spec, pas un enrichissement.

---

## 0. Comment lire ce document

- **§2 est la partie normative.** C'est le code qui vivra dans les
  `*_interface.ts` et dans le module d'énumérations partagé. Tout le reste
  l'explique.
- Les sections suivantes ne redéfinissent jamais un type : elles y renvoient.
- `PROPOSITION` = pas dans la spec, je l'ajoute et je dis pourquoi.
- `ÉCARTÉ` = envisagé, retiré, avec la raison. Voir aussi §10.

**Localisation des fichiers**

```
packages/shared/src/
  enums.ts                     valeurs codées — jamais de littéral en ligne
  date_interface.ts            ResolvedDate & co — le cœur du contrat
  error_interface.ts           modèle d'erreur uniforme
  filter_interface.ts          paramètres de filtre, enveloppe de liste
  photo_interface.ts           photos, albums, facettes
  text_interface.ts            documents, pages, passages, entrées, corrections
  overlap_interface.ts         recouvrement texte ↔ images
  task_interface.ts            tâches, sélections, notes, manifeste
  job_interface.ts             opérations longues
  system_interface.ts          état et fraîcheur
```

Le backend importe ces fichiers ; le frontend aussi. Il n'existe **aucune**
définition de forme de réponse ailleurs.

---

## 1. Les sept règles que les types font respecter

Ces règles viennent de **« Règles invariantes »** et de **« Besoins pour le
backend § Règles »**. Elles ne sont pas des consignes d'implémentation : elles
sont encodées dans §2, de sorte qu'un backend qui compile ne peut pas les
violer.

1. **Aucune date nue.** Il n'existe dans tout le contrat aucun champ de type
   `string` nommé `date`. Ce que le système **affirme** sur le monde passe par
   `ResolvedDate`, qui porte toujours nature, source, précision et deux bornes.
   Ce que l'**utilisateur demande ou déclare** passe par `IsoDate`, un type
   marqué (*branded*) qu'aucune chaîne littérale ne peut satisfaire.
2. **`kind` est dérivé, jamais saisi.** Aucun type d'entrée (`*Input`) ne porte
   `kind` ni `source`. Le client envoie des bornes et une précision ; le serveur
   pose `kind: 'decision'`, `source: 'annotation'`.
3. **Absent n'est pas zéro.** Toute valeur manquante est `null` explicite.
   Aucune valeur par défaut ne se lit comme une donnée.
4. **Le vocabulaire ouvert n'est pas une énumération.** Les raisons de doute,
   les tags, les pays, les chemins d'album sont typés `string` — ce sont des
   données, pas des unions TypeScript. Elles ont chacune un endpoint de
   vocabulaire. (Le vocabulaire des doutes a déjà changé une fois et le pipeline
   s'est désynchronisé avec lui-même.)
5. **Rien de pré-formaté.** Le serveur ne rend jamais une date, un nombre ou un
   libellé localisé. Il envoie des bornes, une précision, un compte. Le
   frontend rend.
6. **Toute réponse filtrée dit ce qu'elle a écarté**, et toute lecture
   généreuse dit **quel champ a répondu**. C'est le type `ListEnvelope<T>` et le
   champ `matchedOn`, pas une discipline.
7. **`photos.id` n'existe pas dans le contrat.** L'identité d'une photo est
   `cloudAssetId` (32 hex), celle d'un contenu et d'une vignette est `sha256`
   (64 hex), celle d'un texte est le **couple** `(kind, id)` — `TextRef` — et
   jamais l'identifiant seul : 456 identifiants sont ambigus (§2.6).

**Casse des clés — tranché, une fois.**

| Surface | Convention | Pourquoi |
|:---|:---|:---|
| **API JSON** | **`camelCase`** | C'est du TypeScript des deux côtés ; les mêmes `*_interface.ts` servent au client et au serveur, et une conversion aux frontières est un endroit où se glisse une faute pour aucun bénéfice. |
| **Manifeste exporté** | **`snake_case`** | Figé par l'annexe C de la spécification. C'est le format qui **voyage** — il est lu par un LLM et par des humains, hors de ce système. |
| **Colonnes PostgreSQL** | `snake_case` | Convention de la base. |

La conversion n'existe donc **qu'à un seul endroit** : le sérialiseur du
manifeste, dans `metier/export/`. Nulle part ailleurs. `docs/backend-spec.md`
§12.3 en fait une propriété de la sérialisation canonique.

**Compatibilité — un champ ajouté est un changement de contrat.**

Le client valide chaque réponse en `zod.strictObject` : un champ non déclaré
**lève** au lieu d'être ignoré. C'est délibéré — c'est le détecteur de dérive
qui permet de développer contre des bouchons sans découvrir l'écart à
l'intégration. Conséquence pour le serveur : **aucun ajout n'est gratuit**. Tout
champ nouveau passe d'abord par ce document, et le client s'aligne ensuite.

**Deux règles de transport, conséquences des schémas amont :**

- **Toutes les chaînes qui traversent l'API sont en NFC**, dans les deux sens.
  L'import normalise ; `albumPath` est stocké en NFD par macOS et un `WHERE
  albumPath = '…Algès'` en NFC ne trouve rien. Le client peut donc comparer des
  chaînes littéralement.
- **Un identifiant qui contient `/` ne voyage jamais dans un segment de
  chemin** — il va en paramètre de requête ou dans le corps. `documentId` vaut
  `web/1999/Transat`, `pageId` vaut `logbook/p001`, un identifiant de passage
  vaut `ma-vie/p007/002`. L'encodage `%2F` dans un segment est traité
  différemment selon les routeurs et les proxys ; la chaîne de requête, elle,
  accepte `/` littéralement.

---

## 2. Les types partagés

### 2.1 `enums.ts`

Objets `as const` plutôt que `enum` TypeScript : ils survivent au bundling, se
sérialisent en JSON tels quels, et le type union se dérive.

```ts
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
  WEB_SPAN: 'web_span',                   // ref.web_span · decision humaine
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
```

**Les raisons de doute ne sont pas ici.** `photo_doubts.reason` porte
aujourd'hui `not-a-stay`, `album-not-in-logbook`, `no-place-in-name`,
`out-of-logbook-period` dans l'index, et `several-visits`,
`place-not-on-track` dans `dating.db` — deux vocabulaires divergents pour la
même notion, dans le même pipeline. Elles sont typées `string` et servies par
`GET /vocabularies/doubt-reasons`.

---

### 2.2 `date_interface.ts` — le cœur du contrat

> **La règle capitale.** Une inférence ne doit jamais ressembler à une lecture.
> Elle tient structurellement : le type ci-dessous rend impossible de faire
> voyager une date sans sa nature.

```ts
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
```

**Deux dates au maximum par entité, jamais fondues.** La date **résolue** est
une chose ; les colonnes **brutes** en sont une autre, et elles restent à côté,
intactes — la cascade est une couche de résolution, pas un écrasement, et un
désaccord doit rester constatable.

---

### 2.3 `error_interface.ts`

Une seule forme, sur toutes les réponses non-2xx. `details` est une union
discriminée par `code` : nommer le paramètre fautif devient une obligation du
type, pas une bonne intention.

```ts
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
```

`message` est en français et affichable tel quel. `details` porte de quoi
composer un message plus précis quand l'écran le mérite.

**Les trois échecs d'image ne se confondent jamais** — c'est écrit dans « Les
écrans » et dans « Besoins pour le backend », et ce sont trois codes distincts :

| Échec | Code | HTTP | Portée |
|:---|:---|---:|:---|
| Volume des originaux démonté | `VOLUME_UNAVAILABLE` | 503 | **globale** — configuration, bandeau |
| Le fichier de cette photo est absent | `SOURCE_FILE_MISSING` | 404 | **cette photo** — tuile grise |
| Format qui ne produit aucun pixel | `NOT_RENDERABLE` | 415 | **cette photo** |

Le troisième ne se présente pas sur le périmètre (aucune vidéo, 3 918 jpg,
11 tif, 1 png), mais il existe hors périmètre (40 `.m4v`) et Q5 autorise une
photo hors 1998-2004 dans une tâche.

---

### 2.4 `filter_interface.ts`

```ts
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
```

---

### 2.5 `photo_interface.ts`

```ts
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
```

---

### 2.6 `text_interface.ts`

```ts
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
  /** NULL = date indéterminée. Affichée « indéterminée », jamais devinée. */
  readonly date: ResolvedDate | null;
  /**
   * D'où vient la fenêtre de la page, quand c'est elle qui date ce texte
   * (`date.source === 'page_window'`). NULL sinon.
   *
   * **`carried` est une inférence sur une inférence** : la page ne nomme aucun
   * jour et reprend celui de la précédente. 121 des 462 passages datés par leur
   * page sont dans ce cas. La spécification n'admet que trois natures, donc
   * `date.kind` reste `inference` — mais la nuance doit se voir, et elle ne peut
   * pas se déduire d'une jointure côté client : dans un résultat de recouvrement
   * ou de recherche, la page n'est pas chargée.
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
```

---

### 2.7 `overlap_interface.ts`

```ts
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
```

---

### 2.8 `task_interface.ts`

```ts
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
```

---

### 2.9 `job_interface.ts`

```ts
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
```

---

### 2.10 `system_interface.ts`

```ts
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
```

---

## 3. Le modèle d'erreur

- **Une seule enveloppe**, `ApiError` (§2.3), sur toute réponse non-2xx.
- **`Content-Type: application/json`** y compris sur les erreurs des routes qui
  servent des images.
- Codes HTTP utilisés : `200`, `201`, `202`, `204`, `304`, `400`, `403`, `404`,
  `409`, `415`, `422`, `500`, `503`. Rien d'autre.
- **Aucune erreur muette.** Un `try/catch` qui avale devient un `INTERNAL` avec
  un `traceId` que le serveur journalise.

| Situation | Code | HTTP |
|:---|:---|---:|
| Paramètre de requête inconnu | `UNKNOWN_PARAMETER` | 400 |
| Valeur invalide dans un vocabulaire **fermé** | `INVALID_PARAMETER` | 400 |
| Valeur inconnue dans un vocabulaire **ouvert** | *pas une erreur* — 200, `total: 0`, `unmatchedValues` renseigné | 200 |
| Ressource inexistante | `NOT_FOUND` | 404 |
| Slug déjà pris | `SLUG_TAKEN` | 409 |
| Dossier d'export existant sans `overwrite` | `TARGET_DIRECTORY_EXISTS` | 409 |
| Correction vide ou blanche | `EMPTY_CORRECTION` | 422 |
| Volume des originaux démonté | `VOLUME_UNAVAILABLE` | 503 |
| Fichier de cette photo absent | `SOURCE_FILE_MISSING` | 404 |
| Format sans pixel possible | `NOT_RENDERABLE` | 415 |
| Drapeau désactivé (export datation, légendage) | `FEATURE_DISABLED` | 403 |
| Mutation pendant un import | `IMPORT_IN_PROGRESS` | 409 |

**Au démarrage**, le backend vérifie chaque racine et **refuse de démarrer en
nommant celle qui manque** — sauf la racine des originaux, qui peut être
démontée en session : son absence est un `VOLUME_UNAVAILABLE` par requête, pas
un refus de démarrer, sinon la consultation des vignettes déjà en cache
deviendrait impossible.

---

## 4. Les endpoints

Pas de préfixe de version. **ÉCARTÉ** : le frontend et le backend sont déployés
ensemble, sur la même machine, pour un utilisateur. `schema_version` du
manifeste, lui, existe — c'est le format qui **voyage**, pas l'API.

Le serveur écoute sur `127.0.0.1` et refuse toute origine non locale. Pas
d'authentification.

### 4.0 Quelle tranche débloque quoi

Le découpage est celui d'`impl-frontend`. Il vaut aussi pour le backend : rien
n'oblige à écrire T3 avant que T1 tourne.

| Tranche | Ce qu'elle livre | Endpoints |
|:---|:---|:---|
| **T1** — une tâche, une grille, un dossier | le produit minimal : il écrit le dossier sur disque | `/system/status` · `/tasks` et `/tasks/:slug` (+ `PATCH`, `/opened`) · `/albums` · `/photos` · `/photos/:id` · `/images/*` · `/tasks/:slug/images` · `/tasks/:slug/export` · `/jobs*` |
| **T2** — le texte | documents, pages, recouvrement, notes | `/documents` · `/pages` · `/pages/image` · `/texts` · `/photos/:id/texts` · `/photos?overlapsText…` · `/tasks/:slug/texts` · `/tasks/:slug/notes*` |
| **T3** — chercher | facettes et plein texte | `/photos/facets` · `q` sur `/photos` et `/texts` · `/vocabularies/*` |
| **T4** — écrire | correction et référentiels | `/corrections*` · `/ref/*` |
| **T5** — la revue en entier | **presque aucun endpoint nouveau** | `/tasks/:slug/review` · `/tasks/:slug/duplicate` · `DELETE /tasks/:slug` |

La chronologie et le bandeau de contrôle de T5 se calculent **côté client** à
partir de la sélection déjà chargée. `GET /tasks/:slug/review` reste offert
parce qu'il évite huit agrégations dupliquées dans le client, mais il n'est pas
sur le chemin critique : si `impl-frontend` préfère tout dériver,
**il peut être retiré sans que rien d'autre bouge.**

### 4.1 Système et vocabulaires

| Méthode | Chemin | Écran / besoin | Réponse |
|:---|:---|:---|:---|
| `GET` | `/system/status` | démarrage, bandeaux, §9 | `SystemStatus` |
| `GET` | `/vocabularies/doubt-reasons` | détail photo | `{ items: {reason, label, count}[] }` |
| `GET` | `/vocabularies/selection-reasons` | grille | `{ items: SelectionReason[] }` |

### 4.2 Photos — « Sélection d'images »

| Méthode | Chemin | Réponse |
|:---|:---|:---|
| `GET` | `/photos` | `ListEnvelope<PhotoListItem>` |
| `GET` | `/photos/facets` | `PhotoFacets` (mêmes paramètres de filtre) |
| `GET` | `/photos/:cloudAssetId` | `PhotoDetail` |
| `GET` | `/photos/:cloudAssetId/texts` | `ListEnvelope<TextWithOverlap>` + `OverlapSummary` |
| `PUT` | `/photos/:cloudAssetId/caption` | `CaptionEditInput` → `MachineCaption` en `human-edited` |
| `POST` | `/photos/:cloudAssetId/caption/revert` | `MachineCaption` remis à `machine_original` |
| `GET` | `/albums` | `{ items: Album[] }` — 82 albums, tout tient en une réponse |

**Paramètres de `/photos` et `/photos/facets`** — allowlist stricte, tout autre
nom est un `UNKNOWN_PARAMETER`.

| Paramètre | Type | Vocabulaire | Sémantique |
|:---|:---|:---|:---|
| `scope` | `PhotoScope` | fermé | défaut `hierarchy` |
| `dateFrom`, `dateTo` | `IsoDate` | — | **chevauchement** de l'intervalle résolu, jamais inclusion |
| `reliableDatesOnly` | `boolean` | fermé | défaut **`false`** ; `true` restreint aux 3 060 datées au jour |
| `albumPath` | `string[]` | ouvert | OU entre valeurs |
| `tag` | `string[]` | ouvert | OU |
| `tagMinConfidence` | `number` | — | défaut **absent** ; n'écarte jamais un tag sans confiance |
| `person` | `string[]` | ouvert | OU |
| `country`, `city` | `string[]` | ouvert | OU ; lecture généreuse, cf. §5.3 |
| `hasPosition` | `boolean` | fermé | — |
| `hasOcr` | `boolean` | fermé | — |
| `hasCaption` | `boolean` | fermé | — |
| `q` | `string` | — | plein texte sur tous les champs plausibles, **légende comprise** |
| `overlapsTextKind` + `overlapsTextId` | `TextKind` + `TextId` | fermé + ouvert | axe « texte qui recouvre » ; **les deux ensemble ou aucun** ; ajoute `overlap` à chaque item |
| `inTask` | `TaskSlug` | ouvert | photos déjà retenues dans cette tâche |
| `notInTask` | `TaskSlug` | ouvert | — |
| `sort` | `PhotoSort` | fermé | défaut `date_asc` |
| `limit`, `offset` | `number` | — | facultatifs ; sans eux, tout le résultat est renvoyé |

`cloudAssetId` fait 32 hex : sans `/`, il va bien dans un segment de chemin.

### 4.3 Textes — « Lecture et sélection de texte, page en regard »

| Méthode | Chemin | Réponse |
|:---|:---|:---|
| `GET` | `/documents` | `{ items: TextDocument[] }` — 62 documents |
| `GET` | `/pages?documentId=…` | `{ items: TextPage[] }` |
| `GET` | `/pages/image?pageId=…` | **image/jpeg**, servie telle quelle |
| `GET` | `/texts` | `ListEnvelope<TextUnit>` |

**Paramètres de `/texts`** : `documentId`, `pageId`, `kind`, `dateFrom`,
`dateTo`, `q`, `overlapsPhoto` (`CloudAssetId`), `confidence`, `hasCorrection`,
`limit`, `offset`, `sort` (`page` défaut · `date` · `relevance` quand `q`).

`GET /texts?documentId=logbook` renvoie les 492 passages ou les 1 012 entrées
d'un coup : c'est quelques centaines de kilo-octets sur la boucle locale, et
l'écran navigue ensuite sans nouvel appel. **`kind` n'est pas facultatif quand
on désigne un texte précis** — sur `logbook/p003`, les identifiants `001` à
`005` désignent chacun deux textes différents.

**Le recouvrement a exactement deux entrées, une par direction, et aucun
doublon** *(tranché avec `impl-frontend`)* :

| Question | Endpoint |
|:---|:---|
| « quels textes couvrent cette photo ? » | `GET /photos/:cloudAssetId/texts` |
| « quelles photos ce texte couvre-t-il ? » | `GET /photos?overlapsTextKind=…&overlapsTextId=…` |

`GET /texts/overlapping-photos` a été **supprimé** : il faisait doublon avec le
second. Ce qui compte n'est pas l'endpoint en moins mais le fait que **le
prédicat de recouvrement n'existe qu'une seule fois** dans le serveur.

L'`OverlapSummary` voyage dans l'enveloppe de la réponse quand un paramètre de
recouvrement est présent.

### 4.4 Corrections de transcription

L'identifiant contient `/` **et** il est ambigu sans son `kind` : le `TextRef`
voyage donc dans le **corps**, jamais dans le chemin.

| Méthode | Chemin | Corps | Réponse |
|:---|:---|:---|:---|
| `PUT` | `/corrections` | `TextCorrectionInput` | `TextUnit` mis à jour |
| `POST` | `/corrections/revert` | `{ ref: TextRef }` | `TextUnit` sans correction |
| `GET` | `/corrections?status=…` | — | `{ items: TextCorrection[] }` |

`status` filtre sur `CorrectionStatus` — c'est ce que l'écran de réglage
consomme pour lister les corrections « à revoir » et les orphelines.

### 4.5 Tâches — « Choix ou création d'une tâche » et « Revue et export »

| Méthode | Chemin | Corps | Réponse |
|:---|:---|:---|:---|
| `GET` | `/tasks` | — | `{ items: TaskSummary[] }`, la plus récemment ouverte en tête |
| `POST` | `/tasks` | `TaskCreateInput` | 201 `TaskDetail` · 409 `SLUG_TAKEN` |
| `GET` | `/tasks/:slug` | — | `TaskDetail` |
| `PATCH` | `/tasks/:slug` | `TaskPatchInput` | `TaskSummary` |
| `DELETE` | `/tasks/:slug` | — | 200 `{ deleted, exportDirectoryKept }` |
| `POST` | `/tasks/:slug/duplicate` | `{ title, slug }` | 201 `TaskDetail` |
| `POST` | `/tasks/:slug/opened` | — | 204 — met à jour `lastOpenedAt` |
| `POST` | `/tasks/:slug/images` | `TaskImagesMutation` | `TaskImagesMutationResult` |
| `POST` | `/tasks/:slug/texts` | `TaskTextsMutation` | `{ added, removed, rejected, textCount, contentHash }` |
| `POST` | `/tasks/:slug/notes` | `{ title, text, attachedTo }` | 201 `TaskNote` |
| `PATCH` | `/tasks/:slug/notes/:noteId` | partiel | `TaskNote` |
| `DELETE` | `/tasks/:slug/notes/:noteId` | — | 204 |
| `GET` | `/tasks/:slug/review` | — | `TaskReview` (§7.3) |
| `POST` | `/tasks/:slug/export` | `TaskExportInput` | 202 `Job` |

`DELETE /tasks/:slug` **ne touche pas au dossier déjà exporté**, et la réponse
le dit (`exportDirectoryKept: string | null`) pour que la confirmation puisse
le nommer.

### 4.6 Images

| Méthode | Chemin | Réponse |
|:---|:---|:---|
| `GET` | `/images/:sha256/thumb` | image/jpeg 224 px, telle quelle |
| `GET` | `/images/:sha256/render?edge=1400` | image/jpeg, produite par `sips`, cachée |

Détail en §6.

### 4.7 Opérations longues

| Méthode | Chemin | Réponse |
|:---|:---|:---|
| `POST` | `/jobs/import` | 202 `Job` — **non consommé par le frontend en V1**, cf. ci-dessous |
| `POST` | `/jobs/prerender` | 202 `Job` |
| `POST` | `/jobs/caption` | corps `{ scope: CaptionScope, force?: boolean }` → 202 `Job` — **différé**, cf. §4.9 |
| `POST` | `/jobs/dating-export` | 202 `Job` · 403 `FEATURE_DISABLED` |
| `GET` | `/jobs` | `{ items: Job[] }` (les 20 derniers) |
| `GET` | `/jobs/:jobId` | `Job` |
| `POST` | `/jobs/:jobId/cancel` | `Job` |

**Polling, pas de flux.** Un mécanisme unique pour quatre opérations dont les
ordres de grandeur n'ont rien à voir : export ≈ 4 s, pré-rendu ≈ 75 s, import
quelques minutes, légendage des heures. Quatre mécanismes ad hoc pour la même
forme serait du gâchis, et le plus long impose de toute façon le suivi.
**ÉCARTÉ** : SSE et WebSocket — un transport de plus, à tester, pour gagner un
rafraîchissement.

**Aucun identifiant ni horodatage de job ne franchit la frontière du
manifeste.** L'export doit rester idempotent : rejouer le job sur une tâche
inchangée réécrit un dossier identique. Le `jobId` et `job.createdAt` servent au
suivi et ne sont écrits nulle part dans le dossier livré.

**`POST /jobs/import` existe mais aucun écran ne l'appelle.** Nicolas lance
l'import au terminal. L'endpoint reste parce que le mécanisme de job est de
toute façon écrit pour l'export et le pré-rendu, et parce que `GET /jobs/:id`
doit pouvoir rendre compte d'un import déclenché autrement — mais il est le
premier candidat si le périmètre doit être allégé. Ce que le frontend consomme
vraiment de l'import, c'est `GET /system/status` (§9).

### 4.9 Le légendage : les champs sont là, la passe ne l'est pas

**Décision de Nicolas : un échantillon d'abord.** Une passe sur 50 à 100 photos,
qu'il lira avant de décider pour les 3 930. La passe complète n'est **pas**
engagée et **aucune UI de légende n'est en V1**.

Ce que le contrat garde malgré tout — `MachineCaption`, `hasCaption`,
`captionExcerpt`, `PUT /photos/:id/caption`, `POST /jobs/caption` — parce que
des `null` et un `hasCaption: false` ne coûtent rien au client, alors qu'ajouter
ces champs plus tard coûterait une reprise de tous ses schémas (voir la règle de
compatibilité, §1).

**Conséquence normative, et elle compte :** `q` ne dépend **pas** de l'existence
des légendes. Sans une seule légende en base, `q` cherche dans `albumPath`,
`groupName`, le nom de fichier, le lieu, les personnes, les tags et l'OCR, et
rend exactement ce qu'il doit rendre. La légende est un champ **de plus** dans
la lecture généreuse, jamais une condition de son fonctionnement — et
`matchedOn` dit lequel a répondu, ce qui rend la différence visible plutôt que
supposée.

Un seul job mutant à la fois. Un `POST /jobs/import` pendant un export répond
409 `IMPORT_IN_PROGRESS` en nommant le job en cours.

### 4.8 Référentiels — écran « Réglages »

Les trois référentiels de `ref` n'existent que parce qu'une personne les
remplit. Petit écran, gros rendement : 25 saisies corrigent l'intervalle de
421 photos.

| Méthode | Chemin | Corps | Réponse |
|:---|:---|:---|:---|
| `PUT` | `/ref/album-span` | `{ albumPath, dateFrom, dateTo, note }` | `AlbumSpanUpdateResult` |
| `DELETE` | `/ref/album-span` | `{ albumPath }` | `AlbumSpanUpdateResult` — retour au présumé |
| `GET` | `/ref/web-documents` | — | `{ items: WebDocumentRow[] }` |
| `PUT` | `/ref/web-span` | `{ documentId, dateFrom, dateTo, note }` | `TextDocument` |
| `DELETE` | `/ref/web-span` | `{ documentId }` | `TextDocument` |
| `GET` | `/ref/countries` | — | `{ items: CountryRow[] }` |
| `PUT` | `/ref/country-aliases` | `{ raw, normalized }` | `{ items: CountryRow[] }` |

`GET /albums` sert la liste de gauche, **les 25 albums suspects en tête**, avec
`span.presumed` qui distingue `saisi` de `presumed`, et `hints` qui porte les
deux indices d'aide à la saisie.

```ts
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
```

**Validation de `PUT /ref/album-span`** — la seule règle qui refuse :

| Cas | Traitement |
|:---|:---|
| `dateTo < dateFrom` | **400 `INVALID_PARAMETER`** |
| L'intervalle ne recouvre pas l'année du préfixe | **200**, avec `warnings: [{code: 'outside_prefix_year'}]` |
| L'intervalle chevauche un autre album | **200**, avec un avertissement |
| `albumPath` inconnu | 404 `NOT_FOUND` |

`DELETE` repasse l'album en `presumed`, recalcule sa cascade, et la réponse le
dit — `album.span.presumed === true`.

C'est le seul recalcul partiel autorisé de la cascade. Il est synchrone : le
plus gros album fait 286 photos. Il donne à l'utilisateur le retour immédiat qui
rend les 25 saisies motivantes — « cette plage vient de redater 243 photos ».

Les intervalles de `ref.web_span` sont marqués **`kind: 'decision'`,
`source: 'web_span'`** partout où ils servent : ce sont des inférences humaines
grossières, et elles ne doivent jamais se lire comme une date d'époque.

---

## 5. La règle des filtres

> Un filtre demandé doit restreindre, ou ne rien renvoyer, ou échouer
> bruyamment. Il ne disparaît jamais.

### 5.1 Paramètre inconnu ≠ valeur inconnue — la tranche

|  | Traitement | Pourquoi |
|:---|:---|:---|
| **Nom de paramètre** absent de l'allowlist de l'endpoint | **400 `UNKNOWN_PARAMETER`**, en le nommant et en listant les acceptés | Une faute de frappe côté client renverrait sinon la bibliothèque entière. C'est arrivé deux fois dans le pipeline. |
| **Valeur** invalide dans un vocabulaire **fermé** (`sort=weekly`, `scope=foo`, `edge=900`) | **400 `INVALID_PARAMETER`**, avec la liste des valeurs acceptées | Le vocabulaire est connu à la compilation : une valeur hors liste est un bug client, pas une question légitime. |
| **Valeur** absente d'un vocabulaire **ouvert** (`tag=licorne`, `albumPath=…inexistant`) | **200**, `total: 0`, et la valeur listée dans `filters.unmatchedValues` avec ses `nearest` | Les tags, albums, pays et personnes sont des **données**. Une valeur inexistante aujourd'hui peut exister après le prochain import. Un 400 obligerait le client à connaître la base pour formuler une question. |
| **`q` qui se réduit à rien** après nettoyage | **200**, `total: 0`, `unmatchedValues` porte `{parameter:'q', value:'<brut>'}` | Jamais la bibliothèque entière. |

Nettoyage de `q` : suppression des caractères de contrôle (**l'octet NUL en
premier — il tronque une requête au milieu d'un littéral**), échappement des
métacaractères, `unaccent`, repli à zéro si le reste est vide. Requêtes
paramétrées `$1, $2…` partout, jamais d'interpolation.

### 5.2 Ce qui est écarté se compte

Toute réponse filtrée porte `total`, `populationTotal` et `excludedCount`. Le
compte des écartés est **global au filtre**, pas par axe.

**ÉCARTÉ pour l'instant** : `excludedByAxis`, qui dirait quel jeton retirer pour
récupérer le plus de photos. Coût : une requête par axe actif. Sur 3 930 lignes
c'est quelques millisecondes, mais c'est du code et des tests pour un confort.
« Les écrans » demande « un geste pour les ramener » — retirer un jeton **est**
ce geste, et il suffit. À rouvrir si l'usage montre que le compte global ne
suffit pas (question ouverte n° 4).

### 5.3 Chaque filtre dans sa lecture la plus généreuse

Le rappel prime sur la précision. Un faux positif coûte un coup d'œil ; un faux
négatif coûte une photo qu'on ne retrouvera jamais, faute de savoir qu'elle
manque.

| Axe | Lecture généreuse | Ce que `matchedOn` dit |
|:---|:---|:---|
| `dateFrom`/`dateTo` | **chevauchement** de l'intervalle résolu. Mesuré : `2000-12-01 → 2000-12-20` rend **0** photo en lecture stricte et **273** en chevauchement. | — |
| `country` / `city` | cherche aussi dans `albumPath` et `groupName` — `Belize`, `Tikal`, `Sorel` ne sont dans aucune colonne de lieu | `place_country` · `album_path` · `group_name` |
| `q` | `albumPath`, `groupName`, nom de fichier, lieu, personnes, tags, OCR, **légende et mots-clés de légende** | le champ qui a répondu, et `captionExcerpt` surligné quand c'est la légende |
| `person` | correspondance insensible aux accents et à la casse | `person` |
| `tag` | aucun plancher de confiance par défaut ; un tag sans confiance n'est **jamais** écarté | `tag` |
| `overlapsText` | aucun plafond de largeur, y compris les recouvrements à plus d'un mois | — |
| `reliableDatesOnly` | **désactivé par défaut** | — |

**La limite, et elle est dans les types.** Élargir un filtre n'élargit pas ce
qu'on affirme. Une photo ramenée par un chevauchement de mois porte
`precision: 'month'` et l'interface affiche `octobre 1999` — jamais un jour.
Une photo ramenée par le nom de son album porte
`matchedOn: [{field: 'album_path', …}]` — le client sait que ce n'est pas le
GPS qui a répondu. **On ratisse large, on ne raconte pas large.**

### 5.4 Facettes contextuelles

`GET /photos/facets` accepte **exactement** les mêmes paramètres que
`GET /photos` et renvoie les comptes recalculés contre ce filtre. Deux besoins
de la spec l'imposent :

- l'axe lieu est **désactivé avec sa raison affichée** quand le filtre courant
  ne contient aucune photo géolocalisée → `positionedCount === 0` ;
- le vocabulaire des tags est proposé **par sélectivité décroissante avec le
  compte à côté** → `tags` trié par `count` croissant dans la bande 6–500, les
  42 tags > 500 photos marqués `tooBroad` et non mis en avant.

C'est de l'agrégation serveur, que la consigne écarte par défaut. Elle est
justifiée ici : la spec la demande deux fois nommément, et un `GROUP BY` sur
~100 000 liens `photo_tags` du périmètre est de l'ordre de la milliseconde.
Endpoint **séparé** de `/photos` pour que la grille ne l'attende pas et que le
panneau de filtres puisse le débouncer indépendamment.

---

## 6. Le service des images

### 6.1 Vignettes — `GET /images/:sha256/thumb`

Servies **telles quelles** depuis `<THUMBS_ROOT>/<sha256>.jpg`, côté long
224 px. Aucune transformation, aucun cache applicatif : elles existent toutes,
3 925 sur 3 925 sur le périmètre.

```
200  image/jpeg
     Cache-Control: public, max-age=31536000, immutable
     ETag: "<sha256>"
304  sur If-None-Match
404  SOURCE_FILE_MISSING  — la vignette manque (46 cas sur la photothèque entière,
                            0 sur le périmètre). Le client affiche une TUILE GRISE
                            nommant le fichier, jamais un vide.
503  VOLUME_UNAVAILABLE   — la racine des vignettes est démontée
```

`immutable` est correct sans réserve : la clé **est** le hash du contenu.

Une même vignette sert parfois plusieurs photos — 949 groupes de `sha256`
partagés. C'est sans conséquence ici, et c'est la raison pour laquelle
l'identité d'une photo reste `cloudAssetId` et jamais `sha256`.

### 6.2 Rendu intermédiaire — `GET /images/:sha256/render?edge=1400`

Produit par `sips`, **caché sur le disque interne** sous `<RENDER_CACHE_ROOT>`,
jamais sur le volume des originaux.

- `edge` : vocabulaire **fermé**, `1400` seul en V1. Toute autre valeur est un
  400 `INVALID_PARAMETER` listant les valeurs acceptées. Ajouter `2048` plus
  tard n'est pas un changement cassant.
- Même politique de cache que la vignette : la clé est `sha256 + edge`.
- **Pré-construction complète au premier démarrage**, en tâche de fond, sans
  bloquer le démarrage : ≈ 75 s et ≈ 1,4 Go pour le périmètre (extrapolé).
  Pilotée par `POST /jobs/prerender`, son avancement lisible dans
  `SystemStatus.prerender`.
- **Parallélisme 8.** Mesuré : 59 ms en séquentiel, 19 ms à 8 en parallèle —
  c'est le seul levier et il donne un facteur 3.

```
200  image/jpeg   (Cache-Control immutable, ETag "<sha256>-1400")
404  SOURCE_FILE_MISSING  — le fichier original manque, avec `expectedPath`
415  NOT_RENDERABLE       — format qui ne produit aucun pixel, avec `format`
503  VOLUME_UNAVAILABLE   — le volume des originaux est démonté, avec `envVar`
```

Les trois **ne se confondent jamais** : le premier est un problème de cette
photo, le troisième est un problème de configuration global qui déclenche un
bandeau et bloque l'export, pendant que les vignettes déjà chargées restent
utilisables.

### 6.3 Pages scannées — `GET /pages/image?pageId=logbook/p001`

Servies telles quelles depuis `<PAGES_ROOT>/<pages.imagePath>`, ≈ 810 × 1 250 px,
155 fichiers, tous vérifiés présents.

`pageId` est en paramètre de requête : il contient un `/`.

Le zoom et le déplacement sont côté client — l'image est envoyée entière, elle
pèse quelques centaines de kilo-octets. **ÉCARTÉ** : le service par tuiles.
155 images de 1 250 px sur une boucle locale ne le justifient pas.

Trois orthographes coexistent en amont pour le même document — `logbook` (id),
`journal de bord/` (source PDF), `journal-de-bord/` (dossier des images). Le
backend résout par `pages.imagePath`, jamais en reconstruisant un chemin depuis
`documentId`.

### 6.4 Ce que le service d'images ne fait pas

- **Aucune écriture sur le volume des originaux**, caches compris. Le cache de
  rendus vit sur le disque interne.
- **Aucun recadrage, aucune rotation, aucun filigrane.** `pages.rotation` vaut 0
  sur les 155 lignes et `pages.region` est NULL partout.
- **Aucun rendu de région de page** : rien dans les données ne dit où un passage
  se trouve sur l'image. Ne pas promettre ce qui n'existe pas.

---

## 7. Les tâches

### 7.1 Cycle de vie et slug

Le `slug` est la clé d'URL. Il est dérivé du titre, **modifiable à la création
uniquement**, et c'est le nom du dossier livré. Il ne contient donc jamais `/`.
`TaskPatchInput` ne le porte pas : le type interdit le renommage.

`POST /tasks` sur un slug pris répond **409 `SLUG_TAKEN`** avec
`details.existingTaskTitle`, pour que le refus à la saisie puisse nommer la
tâche existante.

Quand `TASKS_ROOT` est inaccessible, `SystemStatus.roots` le dit, `POST /tasks`
répond **503 `VOLUME_UNAVAILABLE`**, et la lecture reste possible : on ne laisse
jamais créer une tâche qui ne pourra pas être exportée.

Les trois états se **calculent**, ils ne se stockent pas :

```
draft           exportedAt === null
exported        exportedAt !== null && contentHash === exportedContentHash
exported_stale  exportedAt !== null && contentHash !== exportedContentHash
```

`contentHash` couvre la sélection d'images (ids, ordre, notes), la sélection de
textes, les notes, le titre, la consigne et la période — **et exclut
`exportedAt`**. C'est ce qui rend l'export idempotent au sens utile du terme :
ré-exporter une tâche inchangée réécrit un dossier identique **au champ
`exported_at` du manifeste près**. Voir question ouverte n° 2.

### 7.2 Sélection par lot

`POST /tasks/:slug/images` prend `add`, `remove` et `update` dans **un seul
corps et une seule transaction**. Sélectionner un album de 286 photos est un
geste, pas 286 requêtes — mais l'enregistrement fait bien une ligne par photo,
parce que le geste et l'enregistrement sont deux unités différentes.

Un ordre par défaut chronologique est attribué à l'insertion ; `update.order`
le remplace. Rien n'est jamais silencieusement ignoré : ce qui n'a pas pu être
appliqué revient dans `rejected` avec sa cause.

**ÉCARTÉ** : `DELETE` avec un corps. C'est légal mais mal supporté par les
proxys et les caches ; `POST` d'une mutation nommée est ennuyeux et sûr.

**ÉCARTÉ** : l'historique et l'annulation des sélections. Désélectionner suffit.

### 7.3 Revue — `GET /tasks/:slug/review`

L'écran de revue a besoin d'un bandeau de contrôle non bloquant et d'une
chronologie qui place images et textes sur un même axe.

```ts
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
```

Un seul appel : l'écran affiche tout d'un coup et le calcul des huit compteurs
sur quelques centaines de lignes ne mérite pas un aller-retour de plus.

### 7.4 Export

`POST /tasks/:slug/export` → **202** + un `Job` de type `export`.

**C'est le backend qui produit le dossier.** L'API ne renvoie ni le manifeste ni
une archive : elle renvoie un `TaskExportReport` dans `job.result`, avec le
chemin absolu du dossier écrit, les comptes, et la liste nommée de ce qui a été
sauté avec sa cause. Le frontend affiche le rapport et le chemin ; c'est
l'utilisateur qui ouvre le dossier, il est sur la même machine.

Contenu écrit — la forme complète est en annexe C de la spec :

```
<TASKS_ROOT>/<slug>/
  manifest.json     images copiées en 1400 px, pages copiées, textes, notes
  README.md
  images/<cloud_asset_id>.jpg
  pages/<doc>-p<NNN>.jpg
  textes/journal.md · ma-vie.md · site-web.md · notes.md
```

Quatre propriétés que le contrat garantit et que le manifeste hérite
directement des types de §2 :

1. `date` est un `ResolvedDate` sérialisé — `kind` et `precision` **survivent à
   la sortie du système**.
2. Trois emplacements distincts et jamais mélangés : `texts[]` (texte d'époque),
   `notes[]` (humain d'aujourd'hui), `images[].caption` (machine).
3. `text` et `text_original` coexistent : une correction ne détruit jamais la
   transcription.
4. Le manifeste est autosuffisant : images et pages copiées dans le dossier, et
   **aucune entrée ne référence un fichier absent**.

Erreurs : dossier existant sans `overwrite` → 409 `TARGET_DIRECTORY_EXISTS` en
le nommant ; disque plein → le job échoue, `report.partial: true`, le dossier
partiel est nommé.

---

## 8. La correction d'OCR

**Globale, pas par tâche** — une erreur d'OCR est fausse dans toutes les tâches.

**Clé : le couple `(kind, id)`, jamais l'`id` seul.** Les identifiants existent
déjà dans `documents.db` — `photo_ui` n'en fabrique aucun — mais `passages.id`
et `log_entries.id` partagent la forme `<pageId>/<NNN>` et **456 valeurs
existent dans les deux tables**. Une table de corrections clée sur l'`id` seul
écraserait la correction d'un passage par celle d'une entrée de journal,
silencieusement, sur 456 cas possibles. D'où `TextRef` partout, et jamais
`TextId` seul dans une signature publique.

Tout `TextUnit` porte **trois champs, toujours** :

```
text            le texte EFFECTIF — corrigé s'il l'a été
textOriginal    la transcription du pipeline, telle qu'elle est AUJOURD'HUI
correction      null, ou { text, originalAtCorrection, correctedAt, needsReview }
```

Jamais l'un sans l'autre : c'est le type qui l'impose, pas la discipline
d'affichage. L'écran affiche `text` en édition et `textOriginal` grisé en
dessous, avec « rétablir » — qui appelle `POST /corrections/revert`.

**Une correction vide est refusée** : 422 `EMPTY_CORRECTION`. Effacer un texte
n'est pas le corriger.

**`status`** : à chaque import, le backend compare `originalAtCorrection` au
texte que le pipeline fournit maintenant.

```
applied       identiques — la correction s'applique
needs_review  le texte amont a bougé : la clé est POSITIONNELLE (<pageId> +
              ordinal/seq), donc une re-dérivation qui recoupe une page décale
              tous les ids suivants de cette page
orphaned      la cible n'existe plus du tout
```

Dans les deux derniers cas la correction est **conservée et signalée**, jamais
appliquée en silence ni supprimée — c'est du travail humain, et
`originalAtCorrection` est précisément le témoin qui rend la dérive détectable.
`ImportReport.correctionsNeedingReview` les liste,
`SystemStatus.attention` les compte, `GET /corrections?status=…` les sert à
l'écran de réglage.

**Elle ne remonte jamais au pipeline.** `readAnnotations` accepte
`target.type: 'log_entry'` et `'passage'` et `kind: 'correction'`, mais son seul
consommateur filtre sur `kind === 'dating'` et `target.type === 'photo'` ou
`'album'` : une correction de texte serait lue, validée, puis **ignorée sans un
mot**. Il n'existe donc, dans tout le contrat, **aucun endpoint qui écrive une
correction vers `adobe_mcp`**.

Le seul chemin d'écriture vers `adobe_mcp` est `POST /jobs/dating-export`,
`kind: 'dating'` sur `target.type: 'photo'` uniquement, par le writer validant
`appendAnnotation`, derrière un drapeau désactivé par défaut. Drapeau éteint →
403 `FEATURE_DISABLED` avec le nom de la variable d'environnement.

---

## 9. La fraîcheur des données

L'import est une opération datée. Trois mécanismes, du plus grossier au plus
fin.

**1. `GET /system/status`** — l'état global : `importedAt`, `importId`, les
racines avec leur disponibilité et leur variable d'environnement, l'avancement
du pré-rendu, et le bloc `attention` (sélections orphelines, corrections à
revoir, albums à plage présumée, documents web sans intervalle). Consulté au
démarrage, et pollé pendant qu'un job tourne.

**2. `importId` dans chaque `ListEnvelope`** — le frontend le compare à celui
qu'il détient. S'il a changé, un import a eu lieu pendant la session et les
données affichées sont périmées : bandeau, et rechargement à la demande de
l'utilisateur. Un champ, aucune infrastructure.

**3. Le marquage par élément** — `TaskImageSelection.orphaned` et
`TaskTextSelection.orphaned` pour une sélection dont la cible a disparu,
`TextCorrection.needsReview` pour une correction dont le texte a bougé,
`AlbumSpan.presumed` pour un intervalle déduit et non saisi. **L'import ne
touche jamais au schéma `app`** : il constate et signale, il ne supprime pas.

**ÉCARTÉ** : un ETag ou un `If-Modified-Since` par ressource. L'import est
manuel, rare, et déclenché depuis cette même interface ; `importId` répond à la
question réelle pour le coût d'une chaîne.

---

## 10. Ce que l'API ne fait délibérément pas

| Absent | Pourquoi |
|:---|:---|
| **Pagination par curseur** | 3 930 photos. `limit`/`offset` existent comme échappatoire, `total` est toujours séparé du transport. |
| **Pagination obligatoire** | Une liste non filtrée pèse ~2,4 Mo *(estimé à ~600 octets par photo, non mesuré)* sur la boucle locale. À mesurer une fois la forme réelle. |
| **Agrégation serveur, sauf les facettes** | Les facettes sont demandées nommément deux fois par la spec (axe lieu désactivé avec sa raison, tags par sélectivité). Le reste se calcule côté client. |
| **Authentification, sessions, CORS ouvert** | Un utilisateur, une machine, `127.0.0.1`. |
| **Versionnement d'URL** | Frontend et backend déployés ensemble. Le manifeste, lui, porte `schema_version` — c'est lui qui voyage. |
| **SSE / WebSocket** | Le job le plus long dure 4 secondes. Polling. |
| **Historique, annulation, corbeille** | Désélectionner suffit. |
| **Embeddings, `similarTo`, « plus-comme-celle-ci »** | `embeddings` a 0 ligne, `pgvector` n'est pas installé. L'axe contenu de la V1 passe par la **légende en texte**, indexée par le même `tsvector` que les documents : aucune infrastructure nouvelle, et une légende sert deux fois — elle indexe la photo *et* elle la décrit au LLM. Un vecteur ne sert qu'une fois. |
| **Détection de doublons** | `visual.dhash` existe, sans usage pour composer une bande dessinée. |
| **Carte, tuiles, géocodage** | 27 % de couverture GPS, **0 %** sur 1998-1999 et sur 2004. |
| **Filtres sur note, drapeau, titre, description, couleur, appareil** | Note > 0 sur 7,6 % · drapeau : **0** sur la période · titre : 2 · description : 1 019 valant toutes `OLYMPUS DIGITAL CAMERA` · couleur : 64 % de gris · appareil : corrélé à l'année, pas une intention de recherche. |
| **Mots-clés `user` proposés comme « vos mots-clés »** | 1 591 des 2 496 noms sont aussi des tags IA et 656 sont des noms d'album. Les présenter ainsi serait faux. |
| **Un endpoint qui renvoie une date pré-formatée** | Un jour inventé au backend est indétectable au frontend. |
| **`photos.id`, `tags.id`, `albums.id`, `people.id`** | Réattribués à chaque build du pipeline. Ils n'existent pas dans le contrat. |
| **Toute écriture vers `adobe_mcp` autre que `POST /jobs/dating-export`** | Écrire autre chose produirait une ligne lue, validée, puis ignorée en silence — le pire des résultats. |
| **Toute écriture sur `/Volumes/OWC Envoy Ultra`** | Caches compris. Les rendus vivent sur le disque interne. |
| **Re-datation, relance de passe, reconstruction d'index** | `photo_ui` est un consommateur. Seule exception : le recalcul partiel de la cascade sur un album dont la plage vient d'être saisie (§4.8). |
| **Rendu HTML des 60 pages du site web** | Thèmes FrontPage, `cp1252`, chemins relatifs. Q4 par défaut (a) : texte seul. |
| **Recouvrement automatique pour le site web** | Aucun de ses 569 passages ne porte de date. Lui en inventer serait exactement l'erreur interdite. |

---

## 11. Questions ouvertes

Chacune appelle un choix. **Le défaut indiqué est ce que j'écris en attendant.**

**1 — ~~Les facettes voyagent-elles avec la grille ?~~ TRANCHÉE**
*(`impl-frontend`)* Séparées. Argument décisif, qui n'est pas celui de la
latence : **les facettes ne dépendent ni du tri ni de l'offset**, alors que la
grille se refetch sur les deux. Ce sont deux clés de cache différentes, donc
deux requêtes — et le vocabulaire fait 2 593 tags, qu'on ne repaie pas à chaque
défilement.

**En revanche `total` et `excludedCount` restent dans `GET /photos`.** Ils
décrivent *cette* réponse. Servis par un second appel, celui-ci pourrait échouer
seul et laisser l'en-tête mentir — or « ce qui est écarté se compte et
s'affiche » est un invariant, et un invariant ne peut pas dépendre d'une requête
qui peut rater.

**2 — L'idempotence de l'export inclut-elle `exported_at` ?**
La spec dit « ré-exporter une tâche inchangée réécrit un dossier identique », et
le manifeste porte `task.exported_at`. Les deux ne peuvent pas être vrais
ensemble. (a) `exported_at` est exclu de la promesse d'identité. (b) Il est figé
à la date du **premier** export et ne bouge plus. (c) Il sort du manifeste et va
dans un `export.json` à part.
*Recommandation : (a).* La propriété utile est « le contenu ne change pas si le
travail n'a pas changé », et `contentHash` la rend vérifiable. (b) ment sur la
date du fichier qu'on a sous les yeux.

**3 — ~~Qui produit `selected_because` ?~~ TRANCHÉE** *(`spec-frontend`)*
Le frontend l'envoie, vocabulaire **fermé**, `['manual']` par défaut. Le backend
ne peut pas le reconstituer : les filtres au moment du geste ne sont stockés
nulle part, et rejouer « cette photo matcherait-elle ces filtres maintenant ? »
donnerait une réponse qui change au fil du remplissage de `ref.album_span`.
C'est de la traçabilité du geste, pas une propriété de la photo. Fermé parce que
ce champ part dans le manifeste et donc dans le contexte du LLM. **Et il est
additif** : re-sélectionner par un autre chemin ajoute une raison, n'en remplace
jamais une.

**4 — ~~Le compte des écartés ventilé par axe ?~~ TRANCHÉE** *(`impl-frontend`)*
Non. Un compte global. `impl-frontend` avait demandé un décompte
*leave-one-out* par axe actif pour afficher le gain sur chaque jeton
(« dates (+41) »), puis a retiré la demande : **retirer un jeton *est* le geste
que la spec demande**, et l'aperçu du gain avant le clic est un confort, pas un
invariant. Le code n'est pas écrit. L'ajout resterait additif si l'usage prouvait
le contraire.

**5 — ~~La note par photo hors tâche ?~~ TRANCHÉE** *(`spec-frontend`)*
Par tâche. Sélection implicite, oui — refuser la note serait absurde — **mais
pas silencieuse** : la réponse porte `implicitlyAdded` et le frontend dit
« Cette photo est maintenant retenue dans *La transat* ». Le principe de §7.3
(rien n'est écarté en silence) vaut aussi à l'écriture. Et le cas « aucune tâche
ouverte » se règle en amont : **le champ note n'est pas offert hors contexte de
tâche**. La grille se parcourt sans tâche ouverte, mais tout ce qui écrit est
porté par une tâche. Pas de note globale sur une photo en V1 ; si le besoin
apparaît (« celle-ci est floue », vrai dans toutes les tâches), c'est une table
distincte, pas un élargissement de celle-ci.

**6 — ~~Les deux entrées du recouvrement, ou une seule ?~~ TRANCHÉE**
*(`impl-frontend`)* Une seule par direction.
`GET /texts/overlapping-photos` est **supprimé**. Les deux directions restent
deux endpoints distincts — elles répondent à deux questions différentes — mais
le doublon sur une seule direction ne servait personne. Ce qui compte n'est pas
l'endpoint en moins : c'est que **le prédicat de §4.1 n'existe qu'une fois**.

**7 — ~~Les endpoints `ref` sont-ils V1 ?~~ TRANCHÉE** *(`spec-frontend`)*
Oui, avec écran : **§5.7 « Réglages » existe désormais dans la spec** et porte
les trois référentiels plus l'état système. §4.8 n'est plus une proposition. Les
deux conséquences pour le contrat sont écrites : les endpoints de lecture
servent les indices d'aide à la saisie (`Album.hints`, `WebDocumentRow.excerpt`)
sans jamais les pré-remplir, et un intervalle qui ne recouvre pas l'année du
préfixe est **accepté avec avertissement**, pas refusé.

**8 — Le rang 4 et le rang 5 doivent-ils être distinguables ?**
« Besoins pour le backend » donne cinq valeurs de `resolved_from`, où
`album_month` couvre à la fois « EXIF écarté » (970 photos) et « pas d'EXIF »
(375). Mais « L'arbitrage se voit » demande que l'interface puisse dire ce qui a
été écarté. *Ce que j'ai écrit :* `resolved_from` garde ses cinq valeurs, et le
bloc `arbitration` porte la distinction — `outcome: 'rejected'` au rang 4,
`null` au rang 5. Aucune valeur d'énumération ajoutée, l'information est là.
À confirmer.

**9 — Quelles largeurs de rendu ouvrir ?**
Écrit : `1400` seul, vocabulaire fermé. Le détail de la grille, l'export et
**l'entrée du modèle de légendage** utilisent la même. Si l'écran de détail veut
un intermédiaire pour un chargement progressif, il faut ouvrir `600` — et alors
le pré-rendu double en temps et en place (≈ 150 s, ≈ 1,6 Go).
*Recommandation : rester à `1400`* ; les vignettes 224 px font déjà l'aperçu.

**10 — Une légende corrigée à la main peut-elle être écrasée par une nouvelle
passe ?** `POST /jobs/caption` porte un `force`. (a) `force` ne re-légende que
les `kind: 'machine'` et saute les `human-edited`. (b) Il écrase tout, la
production d'origine restant dans `machine_original`.
*Recommandation : (a).* Une correction humaine est du travail humain, même règle
que pour l'OCR. Re-légender ce qu'un humain a corrigé demande un geste distinct
et nommé, pas un drapeau générique. **Sans objet tant que la passe complète
n'est pas engagée** (§4.9).

**11 — L'appariement des galeries web produit-il des `texts[]` exportables ?**
Le spike établit 209 liens légende ↔ photo, dont 108 sur 2003-2004 — la **seule**
source de texte d'époque pour cette période. Une légende de galerie est du texte
écrit par Nicolas sur le moment : elle n'est ni un `passage` ni un `log_entry`
(elle n'a ni page ni date propre), ni une légende machine. (a) Un troisième
`TextKind` (`web_caption`) qui entre dans `texts[]`. (b) Un champ distinct sur la
photo, hors de `texts[]`. (c) Hors V1.
*Recommandation : (a)*, et c'est le seul point du contrat que le spike touche —
mais il ajoute une valeur d'énumération, un `spanSource` et une règle de
recouvrement. **Non écrit** tant que la spec frontend ne l'a pas intégré : je ne
l'invente pas.

---

## 12. Incertitudes

Ce que je n'ai pas pu vérifier. Rien n'y est deviné.

1. **`spec-frontend` a répondu sur six points ; `impl-frontend` n'a pas
   répondu.** Les questions 3, 5 et 7 sont tranchées et intégrées. Les questions
   1 (facettes) et 6 (double entrée du recouvrement) restent ouvertes et
   dépendent du découpage en tranches du frontend : elles ne touchent ni §2.2 ni
   le modèle d'erreur, seulement le nombre d'appels.

2. **Je n'ai lu aucune base ni aucun fichier du pipeline.** Tous les schémas,
   formats et comptes cités viennent de `docs/pipeline-inventory.md`,
   `docs/frontend-spec.md` et `docs/spike-dhash-galeries.md`. Je n'ai rien
   re-mesuré, y compris les 456 identifiants ambigus, que je tiens de
   `spec-frontend` et de §7.4 de la spec.

3. **La taille d'une réponse `/photos` non filtrée est une estimation**
   (~600 octets par photo, ~2,4 Mo pour 3 930), pas une mesure. Elle décide de
   la pagination : à mesurer sur la forme réelle de `PhotoListItem` avant de
   figer « pas de pagination ».

4. **Le coût réel des facettes contextuelles n'est pas mesuré.** J'affirme
   « de l'ordre de la milliseconde » sur un `GROUP BY` de ~100 000 liens
   `photo_tags` restreints au périmètre. C'est un raisonnement sur des ordres de
   grandeur, pas un `EXPLAIN ANALYZE`.

5. **Je n'ai pas vérifié que Fastify route correctement un `%2F` dans un
   segment.** C'est précisément pourquoi la règle « un identifiant contenant
   `/` voyage en paramètre de requête » est écrite : elle rend la question sans
   objet. Si le comportement est vérifié et satisfaisant, `GET /pages/:pageId*`
   serait plus élégant.

6. **La forme exacte de `ImportReport.cascade.byRank`** dépend de la façon dont
   la cascade sera implémentée. Je l'ai typée `Record<string, number>` — un
   vocabulaire ouvert — plutôt que d'inventer six clés que l'implémentation
   contredirait.

7. **`TaskReview.timeline` suppose que la chronologie se rend côté client** à
   partir de bornes brutes. Si l'écran veut des seaux (par mois, par semaine),
   c'est de l'agrégation serveur en plus, et il faudra la justifier.

8. **Je n'ai pas tranché la longueur maximale d'un `q`** ni la limite de taille
   de corps d'une mutation par lot. L'ordre de grandeur est rassurant :
   sélectionner le plus gros album envoie 286 identifiants ≈ 12 Ko, et « Tout
   sélectionner » sur les 3 930 résultats ≈ 216 Ko — sous le `bodyLimit` par
   défaut de Fastify, que je crois être 1 Mio **sans l'avoir vérifié dans ce
   dépôt** (il n'y a pas encore de `package.json`). À confirmer d'un coup d'œil
   avant la tranche qui implémente la sélection par lot, et à porter
   explicitement dans la configuration plutôt que de dépendre d'un défaut.
