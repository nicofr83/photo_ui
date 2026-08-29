/**
 * `snake_case`, mécaniquement — le manifeste (annexe C, frontend-spec) n'a
 * AUCUNE table de correspondance : les valeurs des énumérations sont déjà
 * `snake_case` dans le contrat, seules les CLÉS diffèrent de l'API
 * `camelCase`.
 */
function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value !== 'object';
}

/** Numérique pour deux nombres — `.sort()` par défaut compare en texte, `[10, 2]` resterait mal trié. */
function comparePrimitives(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Deux formes qui divergent seulement dans ce que Postgres garantit :
 *   - un tableau d'OBJETS (`images`, `texts`, `notes`) est une SÉQUENCE —
 *     l'ordre est le manifeste lui-même (« l'ordre que le LLM lit »), jamais trié ;
 *   - un tableau de PRIMITIVES (`people`, `covers_images`…) vient d'un
 *     `array_agg` sans `ORDER BY` garanti côté base — trié ici, une fois,
 *     pour que deux exports du même contenu soient byte-identiques
 *     (invariant 7).
 */
export function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map(canonicalise);
    return mapped.every(isPrimitive) ? [...mapped].sort(comparePrimitives) : mapped;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[toSnakeCase(key)] = canonicalise(record[key]);
    }
    return out;
  }
  return value;
}

/** Sérialisation stable : deux appels sur le même contenu sont byte-identiques. */
export function serialise(value: unknown): string {
  return JSON.stringify(canonicalise(value), null, 2);
}
