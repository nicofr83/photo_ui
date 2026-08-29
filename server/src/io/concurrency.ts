/**
 * `sips` est un sous-processus : lancer les 44 000 exécutions de front
 * saturerait le système, et une par une prendrait des dizaines de minutes
 * pour rien. Un pool de taille fixe, sans dépendance — la même idée que
 * `RENDER_CONCURRENCY` (mesuré ailleurs : facteur 3 à 8 workers).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R> | R,
): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
