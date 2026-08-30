import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { SafeFs } from './safe_fs.ts';

/**
 * Le rendu va dans un temporaire du MÊME dossier puis `rename` (tâche 15,
 * §9.2) — partagé par les photos (`image_service.ts`) et les pages
 * (`metier/pages/thumb_service.ts`), jamais deux copies du même geste.
 */
export async function writeCacheAtomic(safeFs: SafeFs, targetPath: string, data: Buffer): Promise<void> {
  const dir = path.dirname(targetPath);
  await safeFs.mkdir(dir);
  const tmpPath = path.join(dir, `.tmp-${randomUUID()}-${path.basename(targetPath)}`);
  await safeFs.writeFile(tmpPath, data);
  await safeFs.rename(tmpPath, targetPath);
}
