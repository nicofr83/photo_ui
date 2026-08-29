import { slugify } from './slug';

describe('slugify derives a folder name from a title', () => {
  test.each([
    ['La transat, septembre-octobre 1999', 'la-transat-septembre-octobre-1999'],
    ['Maison rose Algès', 'maison-rose-alges'],
    ['  espaces   multiples  ', 'espaces-multiples'],
    ['Été 2004 — Belize', 'ete-2004-belize'],
    ['Déjà vu ?', 'deja-vu'],
    ['C/est/un/chemin', 'c-est-un-chemin'],
    ['UPPER CASE', 'upper-case'],
    ['1998-1999', '1998-1999'],
  ])('%s becomes %s', (title, expected) => {
    expect(slugify(title)).toBe(expected);
  });

  test('a title of punctuation alone yields an empty slug rather than a bad one', () => {
    expect(slugify('???')).toBe('');
  });

  test('the result is safe as a directory name', () => {
    expect(slugify('a/b\\c:d*e?f"g<h>i|j')).not.toMatch(/[/\\:*?"<>|]/);
  });

  test('accents are folded, not dropped, so words stay readable', () => {
    expect(slugify('Forêt de Fontainebleau')).toBe('foret-de-fontainebleau');
  });
});
