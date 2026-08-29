import { firstDayOfMonth, lastDayOfMonth, toMonthInput } from './monthRange';

describe('firstDayOfMonth', () => {
  test('a month becomes its first day', () => {
    expect(firstDayOfMonth('2000-12')).toBe('2000-12-01');
  });
  test.each(['', '2000', '2000-13', '2000-00', '2000-1', 'décembre 2000', '2000-12-01'])(
    'refuses %s',
    (raw) => { expect(firstDayOfMonth(raw)).toBeNull(); },
  );
});

describe('lastDayOfMonth', () => {
  test.each([
    ['2000-01', '2000-01-31'],
    ['2000-02', '2000-02-29'],
    ['1999-02', '1999-02-28'],
    ['2000-04', '2000-04-30'],
    ['2000-12', '2000-12-31'],
    ['1900-02', '1900-02-28'],
  ])('%s ends on %s', (month, expected) => {
    expect(lastDayOfMonth(month)).toBe(expected);
  });

  test('refuses what firstDayOfMonth refuses', () => {
    expect(lastDayOfMonth('2000-13')).toBeNull();
    expect(lastDayOfMonth('')).toBeNull();
  });
});

describe('toMonthInput', () => {
  test('a civil day becomes its month', () => {
    expect(toMonthInput('1999-10-14')).toBe('1999-10');
  });
  test('a cleared filter becomes an empty input', () => {
    expect(toMonthInput(null)).toBe('');
  });
});
