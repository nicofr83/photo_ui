import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

interface AnnotationLine {
  readonly at?: unknown;
  readonly kind?: unknown;
  readonly target?: { readonly type?: unknown; readonly id?: unknown };
  readonly value?: { readonly date?: unknown };
}

/**
 * `cloudAssetId` → jour civil. La source la plus rentable de l'import :
 * 728 datations à la main, dont 207 n'existent nulle part ailleurs —
 * `dating.proposals` n'en garde qu'un sous-ensemble filtré.
 *
 * Les autres formes (`kind` ≠ 'dating', cible ≠ 'photo') sont acceptées en
 * amont mais ignorées ici : les reprendre inventerait une donnée que ce
 * lecteur n'a pas mandat de produire.
 */
export async function readAnnotations(dir: string): Promise<Map<string, string>> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.jsonl')).sort();
  const latestAt = new Map<string, string>();
  const dated = new Map<string, string>();

  for (const file of files) {
    const lines = (await readFile(path.join(dir, file), 'utf8')).split('\n');
    for (const [index, line] of lines.entries()) {
      if (line.trim() === '') continue;

      let parsed: AnnotationLine;
      try {
        parsed = JSON.parse(line) as AnnotationLine;
      } catch {
        throw new Error(`ligne malformée dans ${file}:${String(index + 1)}`);
      }

      if (parsed.kind !== 'dating' || parsed.target?.type !== 'photo') continue;
      const targetId = parsed.target.id;
      const date = parsed.value?.date;
      const at = parsed.at;
      if (typeof targetId !== 'string' || typeof date !== 'string' || typeof at !== 'string') continue;

      // Une photo a bien été datée deux fois en amont : la dernière gagne.
      // `>=` (pas `>`) : à égalité de timestamp, la ligne la plus tardive du
      // fichier — donc du même geste qui a suivi — l'emporte.
      const seen = latestAt.get(targetId);
      if (seen === undefined || at >= seen) {
        latestAt.set(targetId, at);
        dated.set(targetId, date);
      }
    }
  }
  return dated;
}
