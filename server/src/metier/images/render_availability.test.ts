import { describe, expect, test } from 'vitest';

import { classifyRenderFailure } from './render_availability.ts';

describe('classifyRenderFailure', () => {
  test('the three failures never collapse into one — the global one wins', () => {
    expect(classifyRenderFailure({ rootMounted: false, fileExists: false, format: 'm4v' }))
      .toBe('VOLUME_UNAVAILABLE');
    expect(classifyRenderFailure({ rootMounted: true, fileExists: false, format: 'jpg' }))
      .toBe('SOURCE_FILE_MISSING');
    expect(classifyRenderFailure({ rootMounted: true, fileExists: true, format: 'm4v' }))
      .toBe('NOT_RENDERABLE');
    expect(classifyRenderFailure({ rootMounted: true, fileExists: true, format: 'jpg' })).toBeNull();
  });

  test('NOT_RENDERABLE is a DENYLIST of pixel-less formats, never an allowlist', () => {
    // Le pipeline a déjà payé cette erreur : sa liste UNSUPPORTED bloquait des
    // centaines de photos pour rien, alors que sips décode CR2/ORF/DNG nativement.
    for (const format of ['cr2', 'orf', 'dng', 'tif', 'psd', 'heic', 'jpeg', 'png']) {
      expect(classifyRenderFailure({ rootMounted: true, fileExists: true, format })).toBeNull();
    }
    for (const format of ['m4v', 'mov', 'mp4', 'avi']) {
      expect(classifyRenderFailure({ rootMounted: true, fileExists: true, format })).toBe('NOT_RENDERABLE');
    }
  });

  test('format comparison is case-insensitive — upstream carries both cases', () => {
    expect(classifyRenderFailure({ rootMounted: true, fileExists: true, format: 'M4V' })).toBe('NOT_RENDERABLE');
    expect(classifyRenderFailure({ rootMounted: true, fileExists: true, format: 'JPG' })).toBeNull();
  });

  test('a missing root always wins over a missing file — a global problem outranks a local one', () => {
    expect(classifyRenderFailure({ rootMounted: false, fileExists: false, format: 'jpg' }))
      .toBe('VOLUME_UNAVAILABLE');
  });
});
