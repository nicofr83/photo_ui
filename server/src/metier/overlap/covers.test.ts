import { describe, expect, test } from 'vitest';

import { logbookCovers, passageCovers, webCovers } from './covers.ts';

describe('rule A — a logbook entry covers up to the eve of the next day WRITTEN', () => {
  test('consecutive days cover one day each', () => {
    const covers = logbookCovers(['1999-10-14', '1999-10-15']);
    expect(covers.get('1999-10-14')).toEqual({ start: '1999-10-14', end: '1999-10-14' });
  });

  test('a gap stretches the window to the eve of the next entry', () => {
    const covers = logbookCovers(['1999-10-14', '1999-11-02']);
    expect(covers.get('1999-10-14')).toEqual({ start: '1999-10-14', end: '1999-11-01' });
  });

  test('the LAST day covers only itself — nothing is invented after it', () => {
    const covers = logbookCovers(['1999-10-14', '1999-11-02']);
    expect(covers.get('1999-11-02')).toEqual({ start: '1999-11-02', end: '1999-11-02' });
  });

  test('the 92-day gap the corpus really contains is not capped', () => {
    const covers = logbookCovers(['2000-03-01', '2000-06-01']);
    expect(covers.get('2000-03-01')?.end).toBe('2000-05-31');
  });

  test('a gap that crosses a year boundary is handled', () => {
    const covers = logbookCovers(['1999-12-20', '2000-01-05']);
    expect(covers.get('1999-12-20')).toEqual({ start: '1999-12-20', end: '2000-01-04' });
  });

  test('unsorted input is handled — the order of rows is not a contract', () => {
    const covers = logbookCovers(['1999-11-02', '1999-10-14']);
    expect(covers.get('1999-10-14')?.end).toBe('1999-11-01');
  });

  test('a day written twice is ONE day — several entries share a window', () => {
    const covers = logbookCovers(['1999-10-14', '1999-10-14', '1999-11-02']);
    expect(covers.size).toBe(2);
    expect(covers.get('1999-10-14')?.end).toBe('1999-11-01');
  });

  test('a single day covers only itself', () => {
    const covers = logbookCovers(['1999-10-14']);
    expect(covers.get('1999-10-14')).toEqual({ start: '1999-10-14', end: '1999-10-14' });
  });

  test('no days at all yields an empty map, never a guess', () => {
    expect(logbookCovers([]).size).toBe(0);
  });
});

describe('rule B — a passage', () => {
  test('a dated passage covers its own day', () => {
    expect(passageCovers('1999-09-23', null)).toEqual({ start: '1999-09-23', end: '1999-09-23' });
  });

  test('an undated passage falls back to its page window', () => {
    expect(passageCovers(null, { start: '1999-09-23', end: '1999-09-25' }))
      .toEqual({ start: '1999-09-23', end: '1999-09-25' });
  });

  test('its OWN date wins over the page window', () => {
    expect(passageCovers('1999-09-24', { start: '1999-09-23', end: '1999-09-25' }))
      .toEqual({ start: '1999-09-24', end: '1999-09-24' });
  });

  test('no date and no page window covers nothing — never the whole corpus', () => {
    expect(passageCovers(null, null)).toBeNull();
  });
});

describe('rule C — the web site', () => {
  test('without a saisi span a web passage covers nothing', () => {
    expect(webCovers(null)).toBeNull();
  });

  test('with a span it covers exactly it', () => {
    expect(webCovers({ from: '1999-09-01', to: '1999-11-30' }))
      .toEqual({ start: '1999-09-01', end: '1999-11-30' });
  });
});
