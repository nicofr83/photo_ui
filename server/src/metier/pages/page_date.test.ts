import { describe, expect, test } from 'vitest';

import { resolvePageDates } from './page_date.ts';

const page = (ordinal: number, registerDates: string[], noteDates: string[] = []) =>
  ({ pageId: `d/p${String(ordinal).padStart(3, '0')}`, ordinal, registerDates, noteDates });

describe('resolvePageDates', () => {
  test('le registre date la page', () => {
    const [r] = resolvePageDates([page(1, ['1998-07-09', '1998-07-19'])]);
    expect(r).toEqual({ pageId: 'd/p001', start: '1998-07-09', end: '1998-07-19', source: 'register' });
  });

  test('les notes du haut ne déplacent jamais une date que le registre établit', () => {
    // Un billet de musée collé après coup, daté un mois plus tôt.
    const [r] = resolvePageDates([page(1, ['1999-08-04', '1999-08-07'], ['1999-07-01'])]);
    expect(r?.start).toBe('1999-08-04');
    expect(r?.source).toBe('register');
  });

  test('une page sans registre prend la date lue dans ses notes', () => {
    const [r] = resolvePageDates([page(1, [], ['1998-07-08'])]);
    expect(r).toEqual({ pageId: 'd/p001', start: '1998-07-08', end: '1998-07-08', source: 'notes' });
  });

  test('une page sans rien hérite de la précédente', () => {
    const rs = resolvePageDates([page(1, ['1999-08-04']), page(2, [], [])]);
    expect(rs[1]).toEqual({ pageId: 'd/p002', start: '1999-08-04', end: '1999-08-04', source: 'carried' });
  });

  test("l'héritage ne remonte jamais le temps : les pages avant la première datée restent sans date", () => {
    const rs = resolvePageDates([page(1, [], []), page(2, [], []), page(3, ['1999-08-04'])]);
    expect(rs.map((r) => r.pageId)).toEqual(['d/p003']);
  });

  test("l'ordre de traitement est celui des ordinaux, pas celui du tableau reçu", () => {
    const rs = resolvePageDates([page(3, [], []), page(1, ['1999-08-04']), page(2, [], [])]);
    expect(rs.map((r) => [r.pageId, r.source])).toEqual([
      ['d/p001', 'register'], ['d/p002', 'carried'], ['d/p003', 'carried'],
    ]);
  });

  test('the widest bound of multiple register dates on the same page is kept, not just the first', () => {
    const [r] = resolvePageDates([page(1, ['1999-08-10', '1999-08-04', '1999-08-07'])]);
    expect(r).toMatchObject({ start: '1999-08-04', end: '1999-08-10' });
  });

  test('an empty input returns an empty result, never throws', () => {
    expect(resolvePageDates([])).toEqual([]);
  });
});
