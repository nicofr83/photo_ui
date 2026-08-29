import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * `sips`, jamais par un shell — les noms de fichiers réels portent espaces,
 * accents et parenthèses (`98-99 maison rose (N).jpg`), et un shell les
 * interpréterait. `sips` n'écrit que sur disque : redimensionner en mémoire
 * passe par un fichier temporaire, jeté immédiatement après lecture.
 *
 * Écrase le rapport d'aspect (`--resampleHeightWidth`, pas `-Z`) : c'est
 * exactement ce que le pipeline fait pour son propre dhash
 * (`docs/spike-dhash-galeries.md` §2), et la variante « moyenne de surface »
 * n'a jamais été mesurée qu'avec cette même distorsion.
 */
export async function resizeToBmp(inputPath: string, width: number, height: number): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'sips-'));
  const outputPath = path.join(dir, 'out.bmp');
  try {
    await execFileAsync('sips', [
      '-s', 'format', 'bmp',
      '--resampleHeightWidth', String(height), String(width),
      inputPath,
      '--out', outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
