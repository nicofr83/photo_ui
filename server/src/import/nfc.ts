/**
 * macOS écrit les noms de fichiers en NFD. Une égalité littérale avec la même
 * chaîne tapée en NFC ne trouve RIEN — mesuré : zéro ligne sur `…Algès` là où
 * un LIKE en rendait 22. `album_path` étant la clé de `ref.album_span`, une
 * clé en deux normalisations est deux clés. Appliquée sans exception à toute
 * chaîne lue en amont.
 */
export function normalizeNfc<T>(value: T): T {
  if (typeof value === 'string') return value.normalize('NFC') as T;
  if (Array.isArray(value)) return value.map((item: unknown) => normalizeNfc(item)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalizeNfc(v)]),
    ) as T;
  }
  return value;
}
