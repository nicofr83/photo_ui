import { parseIsoDate, isIsoDate } from './date_interface';

describe('parseIsoDate', () => {
  test('accepts a civil day', () => {
    expect(parseIsoDate('1999-10-14')).toBe('1999-10-14');
  });

  test('accepts a leap day that exists', () => {
    expect(parseIsoDate('2000-02-29')).toBe('2000-02-29');
  });

  test.each([
    ['a formatted French date', '14 octobre 1999'],
    ['a timestamp', '1999-10-14T00:00:00Z'],
    ['an unpadded month', '1999-1-4'],
    ['an empty string', ''],
    ['prose', 'octobre 1999'],
    ['a month with no day', '1999-10'],
    ['month 13', '1999-13-01'],
    ['day 32', '1999-10-32'],
    ['a leap day that does not exist', '1999-02-29'],
    ['a 31st in a 30-day month', '1999-04-31'],
    ['trailing whitespace', '1999-10-14 '],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseIsoDate(raw)).toThrow(/1999|octobre|invalid|empty/i);
  });
});

describe('isIsoDate', () => {
  test('narrows a valid day without throwing', () => {
    expect(isIsoDate('2004-09-01')).toBe(true);
  });

  test('returns false instead of throwing on rubbish', () => {
    expect(isIsoDate('OLYMPUS DIGITAL CAMERA')).toBe(false);
  });
});
