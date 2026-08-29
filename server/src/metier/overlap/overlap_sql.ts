/**
 * LE prédicat de recouvrement, une seule fois dans tout le serveur (contrat
 * §4.3 : « GET /texts/overlapping-photos a été supprimé... ce qui compte
 * n'est pas l'endpoint en moins mais le fait que le prédicat n'existe qu'une
 * seule fois »). `&&`, jamais une inégalité — invariant 3.
 *
 * `photoAlias`/`textAlias` : les deux tables portant chacune un alias
 * différent selon l'endroit où le prédicat est monté (`p`/`t` la plupart du
 * temps, mais `GET /texts?overlapsPhoto=` joint `pipeline.photo` sous un nom
 * différent du filtre principal).
 */
export function overlapPredicate(photoAlias: string, textAlias: string): string {
  return `${photoAlias}.resolved_range IS NOT NULL AND ${textAlias}.covers_range IS NOT NULL `
    + `AND ${photoAlias}.resolved_range && ${textAlias}.covers_range`;
}
