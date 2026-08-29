/**
 * Nettoyage de `q` (contrat §5.1). L'octet NUL en premier — un littéral
 * paramétré Postgres qui le contient est tronqué à cet octet, silencieusement,
 * pas une erreur. Les AUTRES caractères de contrôle sont retirés pour la même
 * raison de prudence. `unaccent` et l'échappement des métacaractères
 * `tsquery` restent du côté SQL (`plainto_tsquery`, `unaccent()`) : ce module
 * ne touche qu'à ce qu'aucune requête paramétrée ne protège déjà.
 *
 * Repli à zéro : une requête qui ne contient QUE du bruit rend `null`, jamais
 * une chaîne vide qu'un `WHERE` mal écrit laisserait passer pour « tout ».
 */
export function cleanSearchQuery(raw: string): string | null {
  // eslint-disable-next-line no-control-regex -- retrait délibéré des caractères de contrôle, NUL inclus
  const withoutControlChars = raw.replaceAll(/[\x00-\x1f\x7f]/g, '');
  const trimmed = withoutControlChars.trim();
  return trimmed === '' ? null : trimmed;
}
