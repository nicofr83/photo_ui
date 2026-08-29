import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Empreinte d'un arbre de fichiers : chaque chemin relatif ET le contenu
 * comptent — un ajout, une suppression ou un seul octet changé produit une
 * empreinte différente. Sert l'invariant 8 (`never_writes_outside.itest.ts`) :
 * la preuve qu'un rendu n'a RIEN touché sous `ORIGINALS_ROOT`.
 */
export async function fingerprintTree(root: string): Promise<string> {
  const entries: string[] = [];

  async function walk(dir: string): Promise<void> {
    const names = await readdir(dir, { withFileTypes: true });
    for (const entry of names) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        const content = await readFile(full);
        const digest = createHash('sha256').update(content).digest('hex');
        entries.push(`${path.relative(root, full)}:${digest}`);
      }
    }
  }

  await walk(root);
  entries.sort();
  return createHash('sha256').update(entries.join('\n')).digest('hex');
}
