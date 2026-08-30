import { render, screen } from '@testing-library/react';

import { parseIsoDate, type DateArbitration, type ResolvedDate } from '../../shared/date_interface';
import { DateKind, DatePrecision, DateSource } from '../../shared/enums';
import { expectedKindFor } from '../../domain/dateKind';

import { ResolvedDateView } from './ResolvedDate';

/** `page_date` has two valid natures (dateKind.ts) — unused by this file's
 * fixed set of sources, but the helper stays honest about the general case. */
function singleValidKind(source: DateSource): DateKind {
  const expected = expectedKindFor(source);
  if (typeof expected === 'string') return expected;
  const [first] = expected;
  if (first === undefined) throw new Error(`expectedKindFor(${source}) returned an empty array`);
  return first;
}

function dateFrom(
  source: DateSource,
  precision: DatePrecision = DatePrecision.DAY,
  over: Partial<ResolvedDate> = {},
): ResolvedDate {
  const bounds = {
    [DatePrecision.DAY]: ['1999-10-14', '1999-10-14'],
    [DatePrecision.MONTH]: ['1999-10-01', '1999-10-31'],
    [DatePrecision.YEAR]: ['1999-01-01', '1999-12-31'],
  }[precision];
  return {
    start: parseIsoDate(bounds[0] as string),
    end: parseIsoDate(bounds[1] as string),
    precision,
    kind: singleValidKind(source),
    source,
    bracketHours: null,
    ...over,
  };
}

test('a reading renders bare and is marked as a reading', () => {
  render(<ResolvedDateView date={dateFrom(DateSource.EXIF_ARBITRATED)} />);
  const element = screen.getByTestId('resolved-date');
  expect(element).toHaveAttribute('data-date-kind', 'reading');
  expect(element).toHaveTextContent('1999-10-14');
  expect(element.textContent).not.toContain('≈');
});

test('INVARIANT §7.1 — an inference is marked with the approximation glyph', () => {
  render(<ResolvedDateView date={dateFrom(DateSource.ALBUM_MONTH, DatePrecision.MONTH)} />);
  const element = screen.getByTestId('resolved-date');
  expect(element).toHaveAttribute('data-date-kind', 'inference');
  expect(element.textContent).toContain('≈');
  expect(element).toHaveTextContent('octobre 1999');
});

test('INVARIANT §7.1 — a human decision is marked with the check glyph', () => {
  render(<ResolvedDateView date={dateFrom(DateSource.ANNOTATION)} />);
  const element = screen.getByTestId('resolved-date');
  expect(element).toHaveAttribute('data-date-kind', 'decision');
  expect(element.textContent).toContain('✓');
});

test('INVARIANT §9.6.4 — a month never shows a day in the DOM', () => {
  render(<ResolvedDateView date={dateFrom(DateSource.ALBUM_MONTH, DatePrecision.MONTH)} />);
  expect(screen.getByTestId('resolved-date').textContent).not.toMatch(/\b(?:0?[1-9]|[12]\d|3[01])\b/);
});

test('INVARIANT §7.4 — a null date renders "sans date", never a default', () => {
  render(<ResolvedDateView date={null} />);
  const element = screen.getByTestId('resolved-date');
  expect(element).toHaveAttribute('data-date-kind', 'absent');
  expect(element).toHaveTextContent('sans date');
  expect(element.textContent).not.toMatch(/\d/);
});

test('the nature reaches a screen reader in words, not only in colour', () => {
  render(<ResolvedDateView date={dateFrom(DateSource.ALBUM_YEAR, DatePrecision.YEAR)} />);
  expect(screen.getByTestId('resolved-date')).toHaveAccessibleName('date inférée : 1999');
});

test('the glyph is hidden from assistive technology, which reads the label instead', () => {
  render(<ResolvedDateView date={dateFrom(DateSource.ANNOTATION)} />);
  const glyph = screen.getByTestId('resolved-date').querySelector('[aria-hidden="true"]');
  expect(glyph).not.toBeNull();
  expect(glyph?.textContent).toContain('✓');
});

test('the detail is hidden unless asked for', () => {
  const date = dateFrom(DateSource.LOGBOOK_BRACKET, DatePrecision.DAY, { bracketHours: 96 });
  const { rerender } = render(<ResolvedDateView date={date} />);
  expect(screen.getByTestId('resolved-date').textContent).not.toContain('96');
  rerender(<ResolvedDateView date={date} showDetail />);
  expect(screen.getByTestId('resolved-date').textContent).toContain('± 96 h');
});

test('a proposal without a bracket shows "sans fourchette", never a number', () => {
  render(<ResolvedDateView date={dateFrom(DateSource.LOGBOOK_BRACKET)} showDetail />);
  expect(screen.getByTestId('resolved-date').textContent).toContain('sans fourchette');
});

test('the arbitration detail is shown when supplied', () => {
  const arbitration: DateArbitration = {
    exifDate: '1999-08-14T10:22:00' as DateArbitration['exifDate'],
    gapMonths: 2,
    outcome: 'accepted',
  };
  render(
    <ResolvedDateView
      date={dateFrom(DateSource.EXIF_ARBITRATED)}
      arbitration={arbitration}
      showDetail
    />,
  );
  expect(screen.getByTestId('resolved-date').textContent).toContain('confirmé à 2 mois');
});

test('the detail is announced too, not hidden behind the aria-label', () => {
  render(
    <ResolvedDateView
      date={dateFrom(DateSource.LOGBOOK_BRACKET, DatePrecision.DAY, { bracketHours: 96 })}
      showDetail
    />,
  );
  expect(screen.getByTestId('resolved-date')).toHaveAccessibleName(
    'date inférée : 1999-10-14 — ± 96 h',
  );
});
