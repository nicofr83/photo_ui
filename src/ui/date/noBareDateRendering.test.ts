import { globSync, readFileSync } from 'node:fs';

/**
 * ARCHITECTURAL INVARIANT — spec §7.1.
 *
 * `ResolvedDateView` is the only place a date becomes text. If this test fails,
 * a component is about to render a date without its nature, which is exactly
 * how an inference starts looking like a reading.
 *
 * Unlike the behavioural tests, this one protects code that does not exist yet.
 */
const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ['a locale date formatter', /toLocaleDateString|toLocaleString/],
  ['Intl.DateTimeFormat', /Intl\.DateTimeFormat/],
  ['the domain formatter, called directly', /formatResolvedDate/],
  ['a raw resolved bound', /\.(?:start|end)\b(?=[^(]*(?:precision|resolved|date))/i],
  ['a hand-rolled month name table', /'janvier'|"janvier"/],
];

function detectDateRendering(source: string): string[] {
  return FORBIDDEN.filter(([, pattern]) => pattern.test(source)).map(([label]) => label);
}

describe('the detector itself', () => {
  test.each([
    ['const d = x.toLocaleDateString("fr");', 'a locale date formatter'],
    ['new Intl.DateTimeFormat("fr").format(d)', 'Intl.DateTimeFormat'],
    ['import { formatResolvedDate } from "../domain";', 'the domain formatter, called directly'],
    ['const MONTHS = ["janvier", "février"];', 'a hand-rolled month name table'],
  ])('flags %s', (source, expected) => {
    expect(detectDateRendering(source)).toContain(expected);
  });

  test('leaves innocent source alone', () => {
    expect(detectDateRendering('<ResolvedDateView date={photo.date} />')).toEqual([]);
  });
});

describe('the guard, over the real tree', () => {
  test('no component outside src/ui/date renders a date itself', () => {
    const files = globSync('src/{ui,screens}/**/*.{ts,tsx}').filter(
      (file) => !file.includes('src/ui/date/') && !/\.test\.tsx?$/.test(file),
    );

    const offenders = files.flatMap((file) =>
      detectDateRendering(readFileSync(file, 'utf8')).map(
        (reason) => `${file} contains ${reason}`,
      ),
    );

    expect(
      offenders,
      'Only src/ui/date/ResolvedDate.tsx may turn a date into text (spec §7.1).',
    ).toEqual([]);
  });

  test('the guard is actually looking at files, not passing vacuously', () => {
    const files = globSync('src/{ui,screens}/**/*.{ts,tsx}');
    expect(files.length).toBeGreaterThan(0);
  });
});
