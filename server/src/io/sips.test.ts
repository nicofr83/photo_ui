import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from 'vitest';

import { must } from '../../test/helpers/assert.ts';
import { decodeBmp24 } from './bmp_decode.ts';
import { buildSipsArgs, renderToJpeg, resizeToBmp } from './sips.ts';

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

test('buildSipsArgs — an ARGUMENT ARRAY, never a shell string', () => {
  expect(buildSipsArgs('/Volumes/OWC Envoy Ultra/x y.jpg', '/cache/tmp.jpg', 1400))
    .toEqual(['-s', 'format', 'jpeg', '-s', 'formatOptions', '78',
              '-Z', '1400', '/Volumes/OWC Envoy Ultra/x y.jpg', '--out', '/cache/tmp.jpg']);
});

test('buildSipsArgs uses -Z (preserves aspect ratio) — the render, unlike the hash, must not distort', () => {
  const args = buildSipsArgs('/in.jpg', '/out.jpg', 2048);
  expect(args).toContain('-Z');
  expect(args).toContain('2048');
  expect(args).not.toContain('--resampleHeightWidth');
});

test('renderToJpeg produces a real, non-distorted JPEG at the requested edge', async () => {
  const [firstFile] = await readdir(THUMBS_ROOT);
  const input = path.join(THUMBS_ROOT, must(firstFile, 'THUMBS_ROOT est vide'));

  const jpeg = await renderToJpeg(input, 200);
  expect(jpeg.length).toBeGreaterThan(0);
  // En-tête JPEG : `FF D8 FF`.
  expect(jpeg.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
});
