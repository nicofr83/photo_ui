/**
 * Le slug est le nom du dossier livré (contrat §7.1) : jamais de `/`, jamais
 * d'accent brut — translittéré, pas laissé tel quel, sans quoi « Été » et
 * « Ete » collideraient silencieusement en base. Doit satisfaire
 * `app.task.task_slug_is_a_folder_name` (`^[a-z0-9][a-z0-9-]*$`).
 */
const COMBINING_DIACRITICS = /[\u0300-\u036f]/g;

export function deriveSlug(title: string): string {
  const ascii = title.normalize('NFD').replace(COMBINING_DIACRITICS, '');
  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
