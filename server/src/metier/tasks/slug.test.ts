import { expect, test } from 'vitest';

import { deriveSlug } from './slug.ts';

test('the slug never contains a slash — it is the delivered folder name', () => {
  expect(deriveSlug('La transat, septembre/octobre 1999')).not.toMatch(/\//);
});

test('accents are transliterated, not dropped bare', () => {
  expect(deriveSlug('Été à Algès')).toBe('ete-a-alges');
});

test('only lowercase, digits and single dashes survive — matches app.task_slug_is_a_folder_name', () => {
  expect(deriveSlug('  Été à Algès  ')).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  expect(deriveSlug('Été à Algès')).not.toMatch(/--/);
});

test('an apostrophe collapses into a single dash, never a run of them', () => {
  expect(deriveSlug("L'été 1999")).toBe('l-ete-1999');
});
