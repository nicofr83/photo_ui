import {
  EMPTY_TEXT_FILTERS, fromSearchParams, toSearchParams, withRange, withYears,
} from './textFilterState';

const vide = EMPTY_TEXT_FILTERS;

describe('v1.5, Task 10 — years and a range are mutually exclusive', () => {
  test('des années cumulées OU une plage unique, jamais les deux', () => {
    const avecAnnees = { ...vide, years: ['1999', '2000'] };
    expect(withRange(avecAnnees, '1999-08-01', '1999-09-30').years).toEqual([]);
    const avecPlage = { ...vide, from: '1999-08-01', to: '1999-09-30' };
    expect(withYears(avecPlage, ['1999']).from).toBeNull();
  });

  test('les deux bornes atteignent l’URL ensemble ou pas du tout', () => {
    // Le défaut de la V1 : une borne seule est silencieusement ignorée par le
    // serveur, et le second mois ne peut plus rattraper ce que le premier a perdu.
    const params = toSearchParams({ ...vide, from: '1999-08-01', to: null });
    expect(params.get('dateFrom')).toBeNull();
    expect(params.get('dateTo')).toBeNull();
  });

  test('round-tripping through the URL never carries both axes at once', () => {
    const params = new URLSearchParams();
    params.append('year', '1999');
    params.set('dateFrom', '1999-08-01');
    params.set('dateTo', '1999-09-30');
    const state = fromSearchParams(params);
    expect(state.years).toEqual([]);
    expect(state).toEqual({ years: [], from: '1999-08-01', to: '1999-09-30', q: null });
  });

  test('q is dropped when empty, never sent as an empty string', () => {
    expect(toSearchParams({ ...vide, q: '' }).get('q')).toBeNull();
    expect(toSearchParams({ ...vide, q: 'mouillage' }).get('q')).toBe('mouillage');
  });
});
