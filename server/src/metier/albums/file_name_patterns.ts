/**
 * L'indice « motif de nom de fichier » de l'écran de réglage
 * (`docs/api-contract.md`, `AlbumSpanHints.fileNamePatterns`) : un album dont
 * le PRÉFIXE ne porte qu'un mois (`1998-02-Maison rose Algès`, présumé un
 * mois) peut voir ses fichiers eux-mêmes porter un motif `NN-NN` qui suggère
 * une plage plus large — 19 des 22 fichiers de cet album précis s'appellent
 * `98-99 maison rose Lisbonne (N).jpg`. Un INDICE, jamais une source de date :
 * `isSuspectedRange` sur le NOM D'ALBUM et ce motif sur les noms de FICHIERS
 * sont complémentaires.
 */
const PATTERN = /\b\d{2}-\d{2}\b/g;

export function extractFileNamePatterns(fileNames: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const name of fileNames) {
    for (const match of name.matchAll(PATTERN)) {
      counts.set(match[0], (counts.get(match[0]) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([pattern]) => pattern);
}
