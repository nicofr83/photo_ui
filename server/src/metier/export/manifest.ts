/**
 * La forme du manifeste — annexe C de `docs/frontend-spec.md`, avec UNE
 * correction assumée : l'exemple JSON de l'annexe donne `texts[].date` à
 * quatre clés (`from`/`to`/`kind`/`source`), mais §7.4 point 1 du CONTRAT (la
 * prose, qui fait autorité sur son propre exemple) exige explicitement les
 * MÊMES six clés que `images[].date` — « un lecteur qui peut compter sur
 * "tout objet date a les mêmes clés" ne se fait pas piéger ». On suit la
 * prose, pas l'exemple qui triche.
 *
 * `ManifestInput*` : ce que reçoit `buildManifest`, en `camelCase` — comme
 * partout ailleurs dans ce dépôt. `Manifest*` : ce qu'il rend, en
 * `snake_case` — la forme livrée. La conversion est FAITE ICI, à la main,
 * jamais déléguée à `canonicalise` (qui, lui, sert la sérialisation stable
 * de ce résultat déjà en forme, pas la traduction des clés).
 */

// ---- sortie — `snake_case`, la forme livrée ----

export interface ManifestResolvedDate {
  readonly start: string;
  readonly end: string;
  readonly precision: string;
  readonly kind: string;
  readonly source: string;
  readonly bracket_hours: number | null;
}

export interface ManifestPosition {
  readonly lat: number;
  readonly lon: number;
  readonly kind: string;
  readonly source: string;
}

export interface ManifestOverlap {
  readonly from: string;
  readonly to: string;
  readonly rule: string;
  readonly span_source: string | null;
}

export interface ManifestCaption {
  readonly text: string;
  readonly kind: string;
  readonly model: string;
  readonly created_at: string;
}

export interface ManifestImage {
  readonly cloud_asset_id: string;
  readonly sha256: string;
  readonly file: string;
  readonly album_path: string | null;
  readonly group_name: string | null;
  readonly date: ManifestResolvedDate | null;
  readonly position: ManifestPosition | null;
  readonly people: readonly string[];
  readonly place: { readonly city: string | null; readonly country: string | null };
  readonly user_note: string | null;
  /** Légende VLM, JAMAIS dans `texts[]` ni `notes[]` — la passe n'a jamais tourné (D9), donc toujours `null` aujourd'hui. */
  readonly caption: ManifestCaption | null;
  readonly selected_because: readonly string[];
}

export interface ManifestText {
  readonly id: string;
  readonly kind: string;
  readonly document: string;
  readonly page: string | null;
  readonly page_image: string | null;
  readonly text: string;
  readonly text_original: string | null;
  readonly corrected: boolean;
  /** Ce que le texte AFFIRME — jamais 4 clés, voir le commentaire de fichier. */
  readonly date: ManifestResolvedDate | null;
  /** La fenêtre COUVERTE — n'affirme rien, jamais présentée comme une date. */
  readonly overlap: ManifestOverlap;
  readonly covers_images: readonly string[];
  readonly user_note: string | null;
}

export interface ManifestNote {
  readonly id: string;
  readonly created_at: string;
  readonly title: string;
  readonly text: string;
  readonly attached_to: { readonly images: readonly string[]; readonly texts: readonly string[] };
}

export interface Manifest {
  readonly schema_version: 1;
  readonly task: {
    readonly slug: string;
    readonly title: string;
    readonly brief: string;
    readonly period: { readonly from: string; readonly to: string } | null;
    readonly created_at: string;
    readonly exported_at: string;
  };
  readonly images: readonly ManifestImage[];
  readonly texts: readonly ManifestText[];
  readonly notes: readonly ManifestNote[];
}

// ---- entrée — `camelCase`, assemblée par `export_service.ts` ----

export interface ManifestInputResolvedDate {
  readonly start: string;
  readonly end: string;
  readonly precision: string;
  readonly kind: string;
  readonly source: string;
  readonly bracketHours: number | null;
}

export interface ManifestInputPosition {
  readonly lat: number;
  readonly lon: number;
  readonly kind: string;
  readonly source: string;
}

export interface ManifestInputOverlap {
  readonly from: string;
  readonly to: string;
  readonly rule: string;
  readonly spanSource: string | null;
}

export interface ManifestInputCaption {
  readonly text: string;
  readonly kind: string;
  readonly model: string;
  readonly createdAt: string;
}

export interface ManifestInputImage {
  readonly cloudAssetId: string;
  readonly sha256: string;
  readonly albumPath: string | null;
  readonly groupName: string | null;
  readonly date: ManifestInputResolvedDate | null;
  readonly position: ManifestInputPosition | null;
  readonly people: readonly string[];
  readonly place: { readonly city: string | null; readonly country: string | null };
  readonly userNote: string | null;
  readonly caption: ManifestInputCaption | null;
  readonly selectedBecause: readonly string[];
}

export interface ManifestInputText {
  readonly id: string;
  readonly kind: string;
  readonly document: string;
  /** `null` pour un texte sans page (le web n'en a pas — D9). */
  readonly page: string | null;
  readonly text: string;
  readonly textOriginal: string | null;
  readonly corrected: boolean;
  readonly date: ManifestInputResolvedDate | null;
  readonly overlap: ManifestInputOverlap;
  readonly coversImages: readonly string[];
  readonly userNote: string | null;
}

export interface ManifestInputNote {
  readonly id: string;
  readonly createdAt: string;
  readonly title: string;
  readonly text: string;
  readonly attachedToImages: readonly string[];
  readonly attachedToTexts: readonly string[];
}

export interface ManifestInput {
  readonly task: {
    readonly slug: string;
    readonly title: string;
    readonly brief: string;
    readonly period: { readonly from: string; readonly to: string } | null;
    readonly createdAt: string;
    readonly exportedAt: string;
  };
  readonly images: readonly ManifestInputImage[];
  readonly texts: readonly ManifestInputText[];
  readonly notes: readonly ManifestInputNote[];
}

/** `logbook/p021` → `pages/logbook-p021.jpg` (§6.3, §7.4). */
function pageImagePath(pageId: string | null): string | null {
  return pageId === null ? null : `pages/${pageId.replaceAll('/', '-')}.jpg`;
}

function toManifestDate(date: ManifestInputResolvedDate | null): ManifestResolvedDate | null {
  return date === null ? null : {
    start: date.start, end: date.end, precision: date.precision, kind: date.kind, source: date.source,
    bracket_hours: date.bracketHours,
  };
}

function toManifestPosition(position: ManifestInputPosition | null): ManifestPosition | null {
  return position === null ? null : { lat: position.lat, lon: position.lon, kind: position.kind, source: position.source };
}

function toManifestOverlap(overlap: ManifestInputOverlap): ManifestOverlap {
  return { from: overlap.from, to: overlap.to, rule: overlap.rule, span_source: overlap.spanSource };
}

function toManifestCaption(caption: ManifestInputCaption | null): ManifestCaption | null {
  return caption === null ? null
    : { text: caption.text, kind: caption.kind, model: caption.model, created_at: caption.createdAt };
}

export function buildManifest(input: ManifestInput): Manifest {
  return {
    schema_version: 1,
    task: {
      slug: input.task.slug,
      title: input.task.title,
      brief: input.task.brief,
      period: input.task.period,
      created_at: input.task.createdAt,
      exported_at: input.task.exportedAt,
    },
    images: input.images.map((image) => ({
      cloud_asset_id: image.cloudAssetId,
      sha256: image.sha256,
      file: `images/${image.cloudAssetId}.jpg`,
      album_path: image.albumPath,
      group_name: image.groupName,
      date: toManifestDate(image.date),
      position: toManifestPosition(image.position),
      people: image.people,
      place: image.place,
      user_note: image.userNote,
      caption: toManifestCaption(image.caption),
      selected_because: image.selectedBecause,
    })),
    texts: input.texts.map((text) => ({
      id: text.id,
      kind: text.kind,
      document: text.document,
      page: text.page,
      page_image: pageImagePath(text.page),
      text: text.text,
      text_original: text.textOriginal,
      corrected: text.corrected,
      date: toManifestDate(text.date),
      overlap: toManifestOverlap(text.overlap),
      covers_images: text.coversImages,
      user_note: text.userNote,
    })),
    notes: input.notes.map((note) => ({
      id: note.id,
      created_at: note.createdAt,
      title: note.title,
      text: note.text,
      attached_to: { images: note.attachedToImages, texts: note.attachedToTexts },
    })),
  };
}
