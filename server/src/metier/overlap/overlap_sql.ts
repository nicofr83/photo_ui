/**
 * LE prédicat de recouvrement, une seule fois dans tout le serveur (contrat
 * §4.3 : « GET /texts/overlapping-photos a été supprimé... ce qui compte
 * n'est pas l'endpoint en moins mais le fait que le prédicat n'existe qu'une
 * seule fois »). `&&`, jamais une inégalité — invariant 3.
 *
 * **Règle C n'est pas matérialisée** (`ref.web_span`, §8.1) : un humain peut
 * saisir ou effacer la plage d'un document web À TOUT MOMENT, sans réimport.
 * `pipeline.text_unit.covers_start/covers_end/covers_rule` sont figés depuis
 * l'import — pour un passage web sans page (`page_id IS NULL`), ils restent
 * NULL tant qu'aucune plage n'a jamais été saisie. La fenêtre EFFECTIVE se
 * calcule donc en base, à chaque requête, par `COALESCE` avec `ref.web_span`
 * jointe en direct — jamais depuis la seule colonne stockée, sans quoi
 * éditer une plage n'aurait aucun effet avant le prochain import complet.
 *
 * Toute requête qui utilise ces expressions DOIT joindre :
 *   `LEFT JOIN ref.web_span ws ON ws.document_id = t.document_id AND t.page_id IS NULL`
 * avec l'alias `t` pour `pipeline.text_unit`.
 */
export const WEB_SPAN_JOIN =
  `LEFT JOIN ref.web_span ws ON ws.document_id = t.document_id AND t.page_id IS NULL`;

export const EFFECTIVE_COVERS_START = `COALESCE(t.covers_start, ws.date_from)`;
export const EFFECTIVE_COVERS_END = `COALESCE(t.covers_end, ws.date_to)`;
export const EFFECTIVE_COVERS_RANGE =
  `COALESCE(t.covers_range, CASE WHEN ws.date_from IS NOT NULL THEN daterange(ws.date_from, ws.date_to, '[]') END)`;
/** `covers_rule` figé à l'import vaut NULL pour un passage web sans plage — la règle EFFECTIVE prend `web_span` dès qu'`ref.web_span` la comble. */
export const EFFECTIVE_COVERS_RULE = `COALESCE(t.covers_rule, CASE WHEN ws.date_from IS NOT NULL THEN 'web_span' END)`;

/**
 * `photoAlias` — la table `pipeline.photo`. Suppose `WEB_SPAN_JOIN` déjà
 * monté et `t` comme alias de `pipeline.text_unit` dans la même requête.
 */
export function overlapPredicate(photoAlias: string): string {
  return `${photoAlias}.resolved_range IS NOT NULL AND ${EFFECTIVE_COVERS_RANGE} IS NOT NULL `
    + `AND ${photoAlias}.resolved_range && ${EFFECTIVE_COVERS_RANGE}`;
}
