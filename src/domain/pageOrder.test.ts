import { sortPagesByDate, sortPagesByOrdinal } from './pageOrder';
import type { TextPage } from '../api/contract/text';
import { parseIsoDate } from '../shared/date_interface';
import { DateKind, DatePrecision, DateSource } from '../shared/enums';

function page(id: string, ordinal: number, day: string | null): TextPage {
  return {
    id, documentId: 'logbook', ordinal, label: id,
    width: 810, height: 1250,
    window: null,
    date: day === null ? null : {
      start: parseIsoDate(day), end: parseIsoDate(day), precision: DatePrecision.DAY,
      kind: DateKind.READING, source: DateSource.PAGE_DATE, bracketHours: null,
    },
    matchCount: null, spanSource: null,
    imageUrl: `/pages/image?pageId=${id}`, regionsAvailable: false,
  };
}

describe('v1.5, Task 8 — chronological order, notebook order disagree by design', () => {
  test('chronological order sorts by date, not by ordinal', () => {
    const p003 = page('logbook/p003', 3, '1999-12-08');
    const p005 = page('logbook/p005', 5, '1999-11-01');
    expect(sortPagesByDate([p003, p005]).map((p) => p.id)).toEqual([
      'logbook/p005', 'logbook/p003',
    ]);
  });

  test('notebook order sorts by ordinal, ignoring the date entirely', () => {
    const p003 = page('logbook/p003', 3, '1999-12-08');
    const p005 = page('logbook/p005', 5, '1999-11-01');
    expect(sortPagesByOrdinal([p003, p005]).map((p) => p.id)).toEqual([
      'logbook/p003', 'logbook/p005',
    ]);
  });

  test('a page without a date of its own is pushed to the end, never sorted in as "earliest"', () => {
    const dated = page('logbook/p001', 1, '1999-12-08');
    const undated = page('logbook/p002', 2, null);
    expect(sortPagesByDate([undated, dated]).map((p) => p.id)).toEqual([
      'logbook/p001', 'logbook/p002',
    ]);
  });
});
