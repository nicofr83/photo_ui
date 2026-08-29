import type { TextDocument } from '../api/contract/text';

import { TextSource, groupBySource, sourceOf } from './textSource';

const doc = (id: string): TextDocument => ({
  id, kind: 'html', title: id, pageCount: null, passageCount: 0,
  span: null, hasPages: false,
});

describe('sourceOf', () => {
  test.each([
    ['logbook', TextSource.LOGBOOK],
    ['ma-vie', TextSource.MA_VIE],
    ['web/2003/2003_gal_1', TextSource.WEB],
    ['web/1999/Transat', TextSource.WEB],
  ])('%s belongs to %s', (id, expected) => {
    expect(sourceOf(id)).toBe(expected);
  });
});

describe('groupBySource', () => {
  test('INVARIANT §5.3 — always exactly three sections, never one per document', () => {
    const groups = groupBySource([
      doc('logbook'), doc('ma-vie'),
      doc('web/2003/a'), doc('web/2003/b'), doc('web/1999/c'),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.source)).toEqual(['logbook', 'ma-vie', 'web']);
  });

  test('the 60 web documents collapse into one section', () => {
    const web = groupBySource([doc('web/a'), doc('web/b'), doc('web/c')])
      .find((g) => g.source === TextSource.WEB);
    expect(web?.documents).toHaveLength(3);
  });

  test('a source with no document still gets its section, empty', () => {
    const groups = groupBySource([doc('logbook')]);
    expect(groups.find((g) => g.source === TextSource.MA_VIE)?.documents).toEqual([]);
  });

  test('the sections are titled for a reader, not by document id', () => {
    expect(groupBySource([]).map((g) => g.title))
      .toEqual(['Journal de bord', 'Ma vie', 'Site web']);
  });
});
