/**
 * Le sha256 est validé AVANT toute concaténation de chemin (tâche 15) : un
 * `sha256` reçu via l'URL est une entrée non fiable, et `THUMBS_ROOT` /
 * `RENDER_CACHE_ROOT` sont des racines PLATES, nommées `<sha256>.jpg` — la
 * même convention que le pipeline amont (`content-thumbs/`).
 */
const SHA256 = /^[0-9a-f]{64}$/;

export function thumbPath(sha256: string): string {
  if (!SHA256.test(sha256)) {
    throw new Error(`sha256 invalide : ${JSON.stringify(sha256)}`);
  }
  return `${sha256}.jpg`;
}
