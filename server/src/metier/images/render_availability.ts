/**
 * Les trois échecs, DÉTERMINÉS AVANT d'appeler `sips` — son code de sortie ne
 * les distingue pas (backend-spec, tâche 15) :
 *
 *   1. La racine est-elle montée ?  non → VOLUME_UNAVAILABLE (503, global)
 *   2. Le fichier existe-t-il ?     non → SOURCE_FILE_MISSING (404, cette photo)
 *   3. Le format peut-il rendre ?   non → NOT_RENDERABLE      (415, cette photo)
 *   4. sinon → sips ; un échec ici est un INTERNAL (500)
 *
 * Un DÉNYLIST, jamais un allowlist : le pipeline a payé cette faute une fois
 * déjà — sa liste `UNSUPPORTED` bloquait des centaines de photos que `sips`
 * décode nativement (CR2, ORF, DNG). Seuls les formats vidéo n'ont aucun pixel.
 */
export type RenderFailure = 'VOLUME_UNAVAILABLE' | 'SOURCE_FILE_MISSING' | 'NOT_RENDERABLE';

const NOT_RENDERABLE_FORMATS = new Set(['m4v', 'mov', 'mp4', 'avi']);

export function classifyRenderFailure(input: {
  readonly rootMounted: boolean;
  readonly fileExists: boolean;
  readonly format: string;
}): RenderFailure | null {
  if (!input.rootMounted) return 'VOLUME_UNAVAILABLE';
  if (!input.fileExists) return 'SOURCE_FILE_MISSING';
  if (NOT_RENDERABLE_FORMATS.has(input.format.toLowerCase())) return 'NOT_RENDERABLE';
  return null;
}
