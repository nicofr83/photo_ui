/**
 * Mirrors the invariant fixtures' thumbnails into the repository, once.
 *
 * READS from the originals volume, WRITES only inside this project (spec §7.2).
 * The copies are committed so the test suite and CI never need the volume
 * mounted. Run: node fixtures/copyInvariantThumbs.ts
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { INVARIANT_PHOTOS, MISSING_THUMB_SHA256 } from './invariants/photos';

const source = join(
  process.env['LR_TARGET'] ?? '/Volumes/OWC Envoy Ultra/Pictures/lightroom',
  'work',
  'content-thumbs',
);
const target = 'fixtures/thumbs';

mkdirSync(target, { recursive: true });

let copied = 0;
for (const photo of INVARIANT_PHOTOS) {
  if (photo.sha256 === MISSING_THUMB_SHA256) continue; // deliberately absent
  const name = `${photo.sha256}.jpg`;
  copyFileSync(join(source, name), join(target, name));
  copied += 1;
}

process.stdout.write(`copied ${String(copied)} thumbnails into ${target}\n`);
