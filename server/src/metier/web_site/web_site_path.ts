import { realpath } from 'node:fs/promises';
import path from 'node:path';

/**
 * Les 5 pages du site (V1.7) — motif de nom STRICT, jamais un `id` libre :
 * quatre chiffres, un tiret, quatre chiffres, `.htm`/`.html`. Aucun `/`,
 * aucun `..` ne peut jamais y apparaître — le motif lui-même est la
 * première ligne de défense.
 */
const PAGE_ID_PATTERN = /^(\d{4})-(\d{4})\.html?$/;

/** css/gif/jpg/png — exactement ce que les 5 pages référencent, jamais plus (V1.7, sécurité). */
const ALLOWED_ASSET_EXTENSIONS = new Set(['.css', '.gif', '.jpg', '.png']);

export function isValidPageId(id: string): boolean {
  return PAGE_ID_PATTERN.test(id);
}

/**
 * « Les deux années telles qu'écrites » (team-lead) — dérivé du NOM DE
 * FICHIER, jamais du `<title>` : mesuré sur le corpus réel, `1900-1988.htm`
 * porte `<title>1958-1998</title>`, une relecture narrative qui NE
 * CORRESPOND PAS au nom de fichier. `label` reste la clé structurée et
 * fiable ; `title` reste ce que la page affirme d'elle-même, même quand
 * les deux divergent.
 */
export function labelFromPageId(id: string): string | null {
  const match = PAGE_ID_PATTERN.exec(id);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  return `${match[1]}-${match[2]}`;
}

export function isAllowedAssetExtension(rawPath: string): boolean {
  return ALLOWED_ASSET_EXTENSIONS.has(path.extname(rawPath).toLowerCase());
}

/**
 * Résout `relativePath` sous `canonicalRoot` (déjà canonicalisé une fois
 * par `realpath`, comme les racines de `safe_fs.ts`) et vérifie par
 * `realpath` qu'il y reste APRÈS résolution — un `..` normalisé par
 * `path.join` peut ressortir de la racine (`path.join('/a/b',
 * '../../etc/passwd')` vaut `/etc/passwd`), et un lien symbolique DANS la
 * racine peut pointer au-dehors ; les deux sont attrapés ici, jamais
 * seulement par un motif de nom (V1.7, sécurité — le point qui compte le
 * plus). `null` : hors racine, ou le fichier n'existe pas — les deux
 * refusent de la même façon, jamais un indice sur lequel des deux.
 */
export async function resolveUnderRoot(canonicalRoot: string, relativePath: string): Promise<string | null> {
  const joined = path.join(canonicalRoot, relativePath);
  if (joined !== canonicalRoot && !joined.startsWith(canonicalRoot + path.sep)) return null;

  let real: string;
  try {
    real = await realpath(joined);
  } catch {
    return null;
  }
  if (real !== canonicalRoot && !real.startsWith(canonicalRoot + path.sep)) return null;
  return real;
}
