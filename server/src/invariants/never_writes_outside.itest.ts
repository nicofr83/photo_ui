import { copyFile, mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeEach, expect, test } from 'vitest';

import { createLog, LogLevel } from '../log/log.ts';
import { must } from '../../test/helpers/assert.ts';
import { fingerprintTree } from '../../test/helpers/fs_fingerprint.ts';
import { createSafeFs, type SafeFs } from '../io/safe_fs.ts';
import { getRender, getThumb, type ImageServiceDeps } from '../metier/images/image_service.ts';
import { InFlightRenders } from '../metier/images/in_flight_renders.ts';

const THUMBS_ROOT = '/Volumes/OWC Envoy Ultra/Pictures/lightroom/work/content-thumbs';

let base: string;
let originalsRoot: string;
let renderCacheRoot: string;
let safeFs: SafeFs;
let deps: ImageServiceDeps;

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'invariant8-'));
  originalsRoot = path.join(base, 'originals');
  renderCacheRoot = path.join(base, 'render-cache');
  await mkdir(originalsRoot);
  await mkdir(renderCacheRoot);
  safeFs = await createSafeFs([renderCacheRoot], createLog(LogLevel.ERROR, {}, () => undefined));
  deps = { thumbsRoot: THUMBS_ROOT, originalsRoot, renderCacheRoot, safeFs, inFlight: new InFlightRenders(8) };
});

/**
 * INVARIANT 8 (tâche 15, backend-spec §9.2) : un rendu, réussi ou en échec,
 * ne modifie JAMAIS `ORIGINALS_ROOT` — le cache vit exclusivement sur le
 * disque interne. Étendu aux futures tâches 18/19 (préconstruction, export)
 * quand elles existeront ; pour l'instant seul le service d'images écrit.
 */
test('a successful render leaves ORIGINALS_ROOT byte-for-byte identical', async () => {
  const [sourceFile] = await readdir(THUMBS_ROOT);
  await mkdir(path.join(originalsRoot, 'album'));
  await copyFile(
    path.join(THUMBS_ROOT, must(sourceFile, 'THUMBS_ROOT est vide')),
    path.join(originalsRoot, 'album', 'p.jpg'),
  );

  const before = await fingerprintTree(originalsRoot);

  const result = await getRender(deps, 'b'.repeat(64), { relativePath: 'album/p.jpg', format: 'jpg' }, 1400);
  expect(result.failure).toBeNull();

  const after = await fingerprintTree(originalsRoot);
  expect(after).toBe(before);

  // Contrôle positif : le rendu a bien écrit quelque part — sous le cache,
  // jamais sous les originaux — sans quoi le test serait vide de sens.
  const cached = await readFile(path.join(renderCacheRoot, '1400', `${'b'.repeat(64)}.jpg`));
  expect(cached.length).toBeGreaterThan(0);
});

test('the three failures (missing volume, missing file, unrenderable format) leave ORIGINALS_ROOT untouched', async () => {
  await mkdir(path.join(originalsRoot, 'x'));
  const before = await fingerprintTree(originalsRoot);

  await getRender({ ...deps, originalsRoot: path.join(base, 'nowhere') }, 'a'.repeat(64),
    { relativePath: 'x/p.jpg', format: 'jpg' }, 1400);
  await getRender(deps, 'a'.repeat(64), { relativePath: 'x/missing.jpg', format: 'jpg' }, 1400);
  await getThumb(deps, 'a'.repeat(64));

  expect(await fingerprintTree(originalsRoot)).toBe(before);
});

test('a render cache write can NEVER land under ORIGINALS_ROOT — SafeFs refuses it structurally', () => {
  expect(() => { safeFs.assertWritable(path.join(originalsRoot, 'sneaky.jpg')); })
    .toThrow(/écriture refusée hors racine/);
});
