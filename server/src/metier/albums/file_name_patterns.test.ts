import { describe, expect, test } from 'vitest';

import { extractFileNamePatterns } from './file_name_patterns.ts';

describe('extractFileNamePatterns', () => {
  test('reads the real "98-99" pattern from the Maison rose Algès file names', () => {
    const names = [
      '98-99 maison rose Lisbonne (1).jpg', '98-99 maison rose Lisbonne (2).jpg',
      '98-99 maison rose Lisbonne (3).jpg',
    ];
    expect(extractFileNamePatterns(names)).toEqual(['98-99']);
  });

  test('several distinct patterns are all reported, most frequent first', () => {
    const names = ['00-01 a.jpg', '00-01 b.jpg', '00-01 c.jpg', '02-03 x.jpg'];
    expect(extractFileNamePatterns(names)).toEqual(['00-01', '02-03']);
  });

  test('a file name with no NN-NN pattern contributes nothing', () => {
    expect(extractFileNamePatterns(['DSCN4583.JPG', 'IMG_1618.JPG'])).toEqual([]);
  });

  test('an empty album has no patterns', () => {
    expect(extractFileNamePatterns([])).toEqual([]);
  });

  test('does not confuse a photo sequence number with a date-like pattern — needs the hyphen', () => {
    expect(extractFileNamePatterns(['DSCN4583 (12).jpg'])).toEqual([]);
  });
});
