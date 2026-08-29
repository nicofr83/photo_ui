import { parseIsoDate } from '../shared/date_interface';
import { DateKind, DatePrecision } from '../shared/enums';

import { layoutTimeline } from './chronology';

const entry = (
  id: string, kind: 'image' | 'text', start: string, end: string, dateKind: DateKind = DateKind.READING,
) => ({
  id, kind, start: parseIsoDate(start), end: parseIsoDate(end), precision: DatePrecision.DAY, dateKind,
});

describe('spec §5.6/§7.3 — the chronology places entries on ONE axis, never a point', () => {
  test('an empty timeline lays out nothing', () => {
    expect(layoutTimeline([])).toEqual([]);
  });

  test('a single entry spans the whole axis', () => {
    const laid = layoutTimeline([entry('a', 'image', '1999-01-01', '1999-01-10')]);
    expect(laid).toHaveLength(1);
    expect(laid[0]).toMatchObject({ id: 'a', leftPercent: 0 });
  });

  test('the earliest entry starts at 0%, the latest ends at 100%', () => {
    const laid = layoutTimeline([
      entry('a', 'image', '1999-01-01', '1999-01-01'),
      entry('b', 'text', '1999-12-31', '1999-12-31'),
    ]);
    const a = laid.find((e) => e.id === 'a');
    const b = laid.find((e) => e.id === 'b');
    expect(a?.leftPercent).toBe(0);
    expect(b?.leftPercent).toBeCloseTo(100, 0);
  });

  test('an entry in the middle lands proportionally between the two ends', () => {
    const laid = layoutTimeline([
      entry('a', 'image', '2000-01-01', '2000-01-01'),
      entry('b', 'image', '2000-01-05', '2000-01-05'),
      entry('c', 'image', '2000-01-11', '2000-01-11'),
    ]);
    const b = laid.find((e) => e.id === 'b');
    // 4 days into a 10-day span: 40%.
    expect(b?.leftPercent).toBeCloseTo(40, 0);
  });

  test('a wide entry gets a proportional width, never zero', () => {
    const laid = layoutTimeline([
      entry('a', 'text', '1999-01-01', '1999-01-01'),
      entry('b', 'text', '1999-06-01', '1999-12-31'),
    ]);
    const wide = laid.find((e) => e.id === 'b');
    expect(wide?.widthPercent).toBeGreaterThan(10);
  });

  test('a single-day entry still gets a visible, non-zero width', () => {
    const laid = layoutTimeline([
      entry('a', 'image', '1999-01-01', '1999-01-01'),
      entry('b', 'image', '1999-12-31', '1999-12-31'),
    ]);
    const point = laid.find((e) => e.id === 'a');
    expect(point?.widthPercent).toBeGreaterThan(0);
  });

  test('kind and dateKind travel through unchanged, for colour and shape', () => {
    const laid = layoutTimeline([entry('a', 'text', '1999-01-01', '1999-01-01', DateKind.INFERENCE)]);
    expect(laid[0]).toMatchObject({ kind: 'text', dateKind: 'inference' });
  });

  test('entries are sorted by start, so the caller never has to', () => {
    const laid = layoutTimeline([
      entry('later', 'image', '2000-06-01', '2000-06-01'),
      entry('earlier', 'image', '2000-01-01', '2000-01-01'),
    ]);
    expect(laid.map((e) => e.id)).toEqual(['earlier', 'later']);
  });
});
