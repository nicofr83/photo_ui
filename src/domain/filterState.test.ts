import { PhotoScope, PhotoSort, TextKind } from '../shared/enums';

import {
  EMPTY_FILTERS, activeFilterTokens, fromSearchParams, toSearchParams,
  type FilterState,
} from './filterState';

const roundTrip = (state: FilterState): FilterState =>
  fromSearchParams(toSearchParams(state));

describe('the filter state round-trips through the URL without loss', () => {
  test('an empty state produces an empty query', () => {
    expect(toSearchParams(EMPTY_FILTERS).toString()).toBe('');
  });

  test('a date range survives', () => {
    const state = { ...EMPTY_FILTERS, dateFrom: '2000-12-01', dateTo: '2000-12-20' };
    expect(roundTrip(state)).toEqual(state);
  });

  test('several albums survive, in order', () => {
    const state = {
      ...EMPTY_FILTERS,
      albumPaths: ['2004/2004-03- visite de Tikal', '2000-2001/2000'],
    };
    expect(roundTrip(state)).toEqual(state);
  });

  test('a non-default sort survives', () => {
    const state = { ...EMPTY_FILTERS, sort: PhotoSort.AESTHETICS_DESC };
    expect(roundTrip(state)).toEqual(state);
  });

  test('the reliable-dates toggle survives', () => {
    const state = { ...EMPTY_FILTERS, reliableDatesOnly: true };
    expect(roundTrip(state)).toEqual(state);
  });

  test('a full state survives', () => {
    const state: FilterState = {
      ...EMPTY_FILTERS,
      dateFrom: '1999-01-01', dateTo: '1999-12-31',
      albumPaths: ['1998-1999/1999-10 Lisboa Madere'],
      scope: PhotoScope.ALL, sort: PhotoSort.DATE_DESC, reliableDatesOnly: true,
      overlapsText: { kind: TextKind.PASSAGE, id: 'logbook/p003/001' },
    };
    expect(roundTrip(state)).toEqual(state);
  });
});

describe('T3 — the search axes: tags, people, place, OCR/caption, full text', () => {
  test('every new axis round-trips through the URL', () => {
    const state: FilterState = {
      ...EMPTY_FILTERS,
      tags: ['bateau', 'famille'],
      people: ['Hugo'],
      countries: ['Portugal'],
      cities: ['Marigot'],
      hasPosition: true,
      hasOcr: true,
      hasCaption: true,
      q: 'tempête',
    };
    expect(roundTrip(state)).toEqual(state);
  });

  test('an empty full-text search is not sent at all — distinct from an intentional q=""', () => {
    expect(toSearchParams({ ...EMPTY_FILTERS, q: '' }).has('q')).toBe(false);
  });

  test('the OCR and caption toggles are off, and unwritten, by default', () => {
    expect(EMPTY_FILTERS.hasOcr).toBe(false);
    expect(EMPTY_FILTERS.hasCaption).toBe(false);
    expect(toSearchParams(EMPTY_FILTERS).has('hasOcr')).toBe(false);
    expect(toSearchParams(EMPTY_FILTERS).has('hasCaption')).toBe(false);
  });

  test('every emitted parameter for the new axes is in the contract allowlist', () => {
    const params = toSearchParams({
      ...EMPTY_FILTERS,
      tags: ['a'], people: ['b'], countries: ['c'], cities: ['d'],
      hasPosition: true, hasOcr: true, hasCaption: true, q: 'x',
    });
    const accepted = new Set([
      'scope', 'dateFrom', 'dateTo', 'reliableDatesOnly', 'albumPath', 'tag',
      'tagMinConfidence', 'person', 'country', 'city', 'hasPosition', 'hasOcr',
      'hasCaption', 'q', 'overlapsTextKind', 'overlapsTextId', 'inTask', 'notInTask',
      'sort', 'limit', 'offset',
    ]);
    for (const key of params.keys()) expect(accepted).toContain(key);
  });
});

describe('the overlap axis — spec §4, "ouverture de la grille pré-filtrée"', () => {
  test('a text reference survives the round trip', () => {
    const state = {
      ...EMPTY_FILTERS,
      overlapsText: { kind: TextKind.LOG_ENTRY, id: 'logbook/p003/001' },
    };
    expect(roundTrip(state)).toEqual(state);
  });

  test('contract §4.2 — the two parameters travel together or not at all', () => {
    const state = fromSearchParams(new URLSearchParams('overlapsTextKind=passage'));
    expect(state.overlapsText).toBeNull();
  });

  test('an unknown kind is dropped rather than forwarded', () => {
    const state = fromSearchParams(
      new URLSearchParams('overlapsTextKind=web_gallery&overlapsTextId=x'),
    );
    expect(state.overlapsText).toBeNull();
  });
});

describe('defaults stay out of the URL', () => {
  test('the default sort is not written', () => {
    expect(toSearchParams({ ...EMPTY_FILTERS, sort: PhotoSort.DATE_ASC }).has('sort')).toBe(false);
  });
  test('INVARIANT §7.3 — the reliable-dates toggle is off by default and unwritten', () => {
    expect(EMPTY_FILTERS.reliableDatesOnly).toBe(false);
    expect(toSearchParams(EMPTY_FILTERS).has('reliableDatesOnly')).toBe(false);
  });
  test('the default scope is the hierarchy, and is not written', () => {
    expect(EMPTY_FILTERS.scope).toBe(PhotoScope.HIERARCHY);
    expect(toSearchParams(EMPTY_FILTERS).has('scope')).toBe(false);
  });
});

describe('INVARIANT §9.6.1 — only names the contract accepts are ever emitted', () => {
  const ACCEPTED = new Set([
    'scope', 'dateFrom', 'dateTo', 'reliableDatesOnly', 'albumPath', 'tag',
    'tagMinConfidence', 'person', 'country', 'city', 'hasPosition', 'hasOcr',
    'hasCaption', 'q', 'overlapsTextKind', 'overlapsTextId', 'inTask', 'notInTask',
    'sort', 'limit', 'offset',
  ]);

  test('every emitted parameter is in the contract allowlist', () => {
    const params = toSearchParams({
      ...EMPTY_FILTERS,
      dateFrom: '1999-01-01', dateTo: '1999-12-31',
      albumPaths: ['a', 'b'], scope: PhotoScope.ALL,
      sort: PhotoSort.ALBUM, reliableDatesOnly: true,
      overlapsText: { kind: TextKind.PASSAGE, id: 'logbook/p003/001' },
    });
    for (const key of params.keys()) expect(ACCEPTED).toContain(key);
  });
});

describe('a date range is only sent when both ends are known', () => {
  test('a half-open range emits neither end', () => {
    expect(toSearchParams({ ...EMPTY_FILTERS, dateFrom: '1999-01-01' }).toString()).toBe('');
  });
});

describe('INVARIANT contract §1 — album paths are normalised to NFC', () => {
  test('a decomposed path is emitted composed', () => {
    const decomposed = '1998-1999/1998-02-Maison rose Algès';
    const params = toSearchParams({ ...EMPTY_FILTERS, albumPaths: [decomposed] });
    const emitted = params.get('albumPath');
    expect(emitted).toBe(decomposed.normalize('NFC'));
    expect(emitted).not.toBe(decomposed);
  });
});

describe('unknown parameters in an incoming URL are dropped, not passed through', () => {
  test('a stale or hand-edited parameter does not reach the server', () => {
    const state = fromSearchParams(new URLSearchParams('colour=grey&dateFrom=1999-01-01&dateTo=1999-12-31'));
    expect(toSearchParams(state).has('colour')).toBe(false);
    expect(state.dateFrom).toBe('1999-01-01');
  });

  test('an invalid sort falls back to the default rather than reaching the server', () => {
    expect(fromSearchParams(new URLSearchParams('sort=weekly')).sort).toBe(PhotoSort.DATE_ASC);
  });
});

describe('active filters are listed as removable tokens', () => {
  test('each active axis produces one token', () => {
    const tokens = activeFilterTokens({
      ...EMPTY_FILTERS,
      dateFrom: '2000-12-01', dateTo: '2000-12-20',
      albumPaths: ['2000-2001/2000'],
      reliableDatesOnly: true,
    });
    expect(tokens.map((t) => t.axis)).toEqual(['dates', 'albumPath', 'reliableDatesOnly']);
  });

  test('a token carries a label a person can read', () => {
    const [token] = activeFilterTokens({
      ...EMPTY_FILTERS, dateFrom: '2000-12-01', dateTo: '2000-12-20',
    });
    expect(token?.label).toBe('du 2000-12-01 au 2000-12-20');
  });

  test('removing a token clears exactly its axis and nothing else', () => {
    const state = {
      ...EMPTY_FILTERS,
      dateFrom: '2000-12-01', dateTo: '2000-12-20', albumPaths: ['x'],
    };
    const [dates] = activeFilterTokens(state);
    expect(dates?.remove(state)).toEqual({ ...EMPTY_FILTERS, albumPaths: ['x'] });
  });

  test('an empty state has no tokens', () => {
    expect(activeFilterTokens(EMPTY_FILTERS)).toEqual([]);
  });
});

describe('every axis produces a token that removes exactly itself', () => {
  test('an album token removes only that album', () => {
    const state = { ...EMPTY_FILTERS, albumPaths: ['a', 'b'] };
    const token = activeFilterTokens(state).find((t) => t.label === 'a');
    expect(token?.remove(state)).toEqual({ ...EMPTY_FILTERS, albumPaths: ['b'] });
  });

  test('a scope token returns to the hierarchy', () => {
    const state = { ...EMPTY_FILTERS, scope: PhotoScope.ALL };
    const [token] = activeFilterTokens(state);
    expect(token?.label).toBe('toute la photothèque');
    expect(token?.remove(state)).toEqual(EMPTY_FILTERS);
  });

  test('the out-of-hierarchy scope names itself', () => {
    const [token] = activeFilterTokens({ ...EMPTY_FILTERS, scope: PhotoScope.OUT_OF_HIERARCHY });
    expect(token?.label).toBe('hors hiérarchie');
  });

  test('the reliable-dates token turns the toggle back off', () => {
    const state = { ...EMPTY_FILTERS, reliableDatesOnly: true };
    const [token] = activeFilterTokens(state);
    expect(token?.remove(state)).toEqual(EMPTY_FILTERS);
  });

  test('T3 axes each produce a removable token', () => {
    const state: FilterState = {
      ...EMPTY_FILTERS,
      tags: ['bateau'], people: ['Hugo'], countries: ['Portugal'], cities: ['Marigot'],
      hasPosition: true, hasOcr: true, hasCaption: true, q: 'tempête',
    };
    const tokens = activeFilterTokens(state);
    expect(tokens.map((t) => t.axis).sort()).toEqual(
      ['q', 'tag', 'person', 'country', 'city', 'hasPosition', 'hasOcr', 'hasCaption'].sort(),
    );
    for (const token of tokens) {
      expect(token.remove(state)).not.toEqual(state);
    }
  });

  test('removing one tag among several clears only that one', () => {
    const state = { ...EMPTY_FILTERS, tags: ['a', 'b'] };
    const token = activeFilterTokens(state).find((t) => t.label === 'a');
    expect(token?.remove(state)).toEqual({ ...EMPTY_FILTERS, tags: ['b'] });
  });

  test('the overlap token names the kind of text, and clears on removal', () => {
    const state = {
      ...EMPTY_FILTERS,
      overlapsText: { kind: TextKind.LOG_ENTRY, id: 'logbook/p003/001' },
    };
    const [token] = activeFilterTokens(state);
    expect(token?.axis).toBe('overlapsText');
    expect(token?.label).toMatch(/entrée de journal/i);
    expect(token?.remove(state)).toEqual(EMPTY_FILTERS);
  });
});
