import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Mesure un JPEG déjà en mémoire (le corps d'une réponse HTTP) via
 * `sips -g pixelWidth -g pixelHeight` — le binaire est déjà une dépendance
 * du serveur (`io/sips.ts`), jamais une bibliothèque de plus pour un test.
 */
export async function readJpegSize(buffer: Buffer): Promise<{ width: number; height: number }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'jpeg-size-'));
  const filePath = path.join(dir, 'in.jpg');
  try {
    await writeFile(filePath, buffer);
    const { stdout } = await execFileAsync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath]);
    const width = Number(/pixelWidth: (\d+)/.exec(stdout)?.[1]);
    const height = Number(/pixelHeight: (\d+)/.exec(stdout)?.[1]);
    return { width, height };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
