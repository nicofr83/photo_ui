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

/**
 * Pure, testée séparément de l'exécution : `-Z <edge>` redimensionne au plus
 * grand côté SANS déformer — contrairement à `--resampleHeightWidth` ci-dessus,
 * qui sert le hash, jamais un rendu montré à un humain. `formatOptions 78` est
 * la qualité JPEG (backend-spec §9.2).
 */
export function buildSipsArgs(inputPath: string, outputPath: string, edge: number): string[] {
  return [
    '-s', 'format', 'jpeg', '-s', 'formatOptions', '78',
    '-Z', String(edge),
    inputPath, '--out', outputPath,
  ];
}

/** Le rendu intermédiaire (tâche 15, §9.2) — un JPEG au plus grand côté `edge`. */
export async function renderToJpeg(inputPath: string, edge: number): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'sips-'));
  const outputPath = path.join(dir, 'out.jpg');
  try {
    await execFileAsync('sips', buildSipsArgs(inputPath, outputPath, edge));
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
