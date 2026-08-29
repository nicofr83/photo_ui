import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from 'vitest';

import { must } from '../../test/helpers/assert.ts';
import { decodeBmp24 } from './bmp_decode.ts';
import { resizeToBmp } from './sips.ts';

const THUMBS_ROOT = '/Volumes/OWC Envoy Ultra/Pictures/lightroom/work/content-thumbs';

test('resizes a real thumbnail to an exact WxH, ignoring aspect ratio', async () => {
  const [firstFile] = await readdir(THUMBS_ROOT);
  const input = path.join(THUMBS_ROOT, must(firstFile, 'THUMBS_ROOT est vide'));

  const bmp = await resizeToBmp(input, 72, 64);
  const decoded = decodeBmp24(bmp);

  expect(decoded.width).toBe(72);
  expect(decoded.height).toBe(64);
  // Un vrai pixel, pas du noir uniforme — la conversion a lu quelque chose.
  const [r, g, b] = decoded.pixelAt(36, 32);
  expect(r + g + b).toBeGreaterThan(0);
});

test('rejects a path that does not exist, rather than hanging', async () => {
  await expect(resizeToBmp('/nowhere/at/all.jpg', 72, 64)).rejects.toThrow();
});
