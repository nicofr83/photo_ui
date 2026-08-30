import { attributionTitle, formatYearSpan } from './noteTitle';
import { TextSource } from './textSource';

describe('v1.5, Task 11 — the attribution prefix a note title carries', () => {
  test('le titre porte la source, la page et la date de la page', () => {
    expect(attributionTitle({ source: TextSource.LOGBOOK, ordinal: 12, date: '2003-11-04' }))
      .toBe('journal de bord, page 12 du 04/11/2003');
    expect(attributionTitle({ source: TextSource.MA_VIE, ordinal: 7, date: '1999-09-23' }))
      .toBe('ma vie, page 7 du 23/09/1999');
  });

  test('le site n’a pas de page : le titre nomme le document', () => {
    expect(attributionTitle({ source: TextSource.WEB, documentTitle: 'Vers Trinidad', span: null }))
      .toBe('site web, Vers Trinidad');
    expect(
      attributionTitle({ source: TextSource.WEB, documentTitle: 'Vers Trinidad', span: '1999-2002' }),
    ).toBe('site web, Vers Trinidad (1999-2002)');
  });

  test('une page sans date ne fabrique jamais un jour', () => {
    expect(attributionTitle({ source: TextSource.LOGBOOK, ordinal: 1, date: null }))
      .toBe('journal de bord, page 1');
  });

  test('formatYearSpan collapses to a single year when the span does not cross one', () => {
    expect(formatYearSpan('1999-08-04', '1999-11-02')).toBe('1999');
    expect(formatYearSpan('1999-01-01', '2002-12-31')).toBe('1999-2002');
  });
});
