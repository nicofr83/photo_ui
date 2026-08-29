import { describe, expect, test } from 'vitest';

import { PhotoScope, PhotoSort } from '@shared/enums';
import { AppError } from '../contract/error_interface.ts';
import { parseQueryParams, type ParamSpec } from './query_params.ts';

const spec = {
  scope: { kind: 'closed', values: Object.values(PhotoScope), fallback: PhotoScope.HIERARCHY },
  sort: { kind: 'closed', values: Object.values(PhotoSort), fallback: PhotoSort.DATE_ASC },
  albumPath: { kind: 'openList' },
  tag: { kind: 'openList' },
  q: { kind: 'open' },
  dateFrom: { kind: 'isoDate' },
  dateTo: { kind: 'isoDate' },
  reliableDatesOnly: { kind: 'boolean', fallback: false },
  limit: { kind: 'integer' },
} satisfies ParamSpec;

/** Attrape l'AppError et la rend typée, pour asserter sur ses `details`. */
function refusal(raw: Record<string, unknown>): AppError {
  try {
    parseQueryParams(raw, spec);
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('aurait dû lever');
}

describe('INVARIANT 2 — a filter never vanishes', () => {
  test('an unknown parameter NAME is a 400 that names it and lists what is accepted', () => {
    const error = refusal({ albumPaht: 'x' });

    expect(error.code).toBe('UNKNOWN_PARAMETER');
    expect(error.httpStatus).toBe(400);
    expect(error.details).toMatchObject({ parameters: ['albumPaht'] });
    expect((error.details as { accepted: string[] }).accepted).toContain('albumPath');
  });

  test('several unknown names are ALL reported, not just the first', () => {
    expect((refusal({ albumPaht: 'x', tagg: 'y' }).details as { parameters: string[] }).parameters)
      .toEqual(['albumPaht', 'tagg']);
  });

  test('an invalid value in a CLOSED vocabulary is a 400 listing the accepted values', () => {
    const error = refusal({ sort: 'weekly' });

    expect(error.code).toBe('INVALID_PARAMETER');
    expect(error.httpStatus).toBe(400);
    expect(error.details).toMatchObject({ parameter: 'sort', received: 'weekly' });
    expect((error.details as { accepted: string[] }).accepted).toContain('date_asc');
  });

  test('an unknown value in an OPEN vocabulary is NOT an error — it restricts to zero', () => {
    // Les tags, albums, pays et personnes sont des DONNÉES. Une valeur
    // inexistante aujourd'hui peut exister après le prochain import ; un 400
    // obligerait le client à connaître la base pour formuler une question.
    expect(parseQueryParams({ tag: 'licorne' }, spec).tag).toEqual(['licorne']);
  });

  test('a malformed date is a 400 naming the parameter, never a silently dropped filter', () => {
    expect(refusal({ dateFrom: '14/10/1999' }).details)
      .toMatchObject({ parameter: 'dateFrom', received: '14/10/1999' });
  });

  test('a date that LOOKS valid but is not a real day is refused', () => {
    // 1999-02-30 a le bon format et n'existe pas.
    expect(refusal({ dateFrom: '1999-02-30' }).code).toBe('INVALID_PARAMETER');
  });

  test('a non-integer limit is refused rather than coerced to NaN', () => {
    expect(refusal({ limit: 'beaucoup' }).details).toMatchObject({ parameter: 'limit' });
  });

  test('every applied filter is REPORTED, which is what makes the rule checkable', () => {
    const parsed = parseQueryParams({ albumPath: 'x', dateFrom: '1999-01-01' }, spec);
    expect(parsed.applied.map((filter) => filter.parameter).sort())
      .toEqual(['albumPath', 'dateFrom']);
  });
});

describe('reading and defaults', () => {
  test('a repeated open value becomes a list, a single one becomes a list of one', () => {
    expect(parseQueryParams({ albumPath: ['a', 'b'] }, spec).albumPath).toEqual(['a', 'b']);
    expect(parseQueryParams({ albumPath: 'a' }, spec).albumPath).toEqual(['a']);
  });

  test('reliableDatesOnly defaults to FALSE — the doubt includes', () => {
    expect(parseQueryParams({}, spec).reliableDatesOnly).toBe(false);
  });

  test('scope defaults to hierarchy and sort to date_asc', () => {
    const parsed = parseQueryParams({}, spec);
    expect(parsed.scope).toBe('hierarchy');
    expect(parsed.sort).toBe('date_asc');
  });

  test('a default is NOT reported as an applied filter — nobody asked for it', () => {
    expect(parseQueryParams({}, spec).applied).toEqual([]);
  });

  test('a boolean only accepts true and false, not 1 or yes', () => {
    expect(parseQueryParams({ reliableDatesOnly: 'true' }, spec).reliableDatesOnly).toBe(true);
    expect(refusal({ reliableDatesOnly: '1' }).code).toBe('INVALID_PARAMETER');
    expect(refusal({ reliableDatesOnly: 'yes' }).code).toBe('INVALID_PARAMETER');
  });

  test('an empty spec refuses every parameter — the allowlist is the whole point', () => {
    expect(() => parseQueryParams({ anything: 'x' }, {})).toThrow(AppError);
  });

  test('a prototype key is not mistaken for a declared parameter', () => {
    // `'constructor' in spec` serait vrai ; l'allowlist doit dire non.
    expect(refusal({ constructor: 'x' }).code).toBe('UNKNOWN_PARAMETER');
  });
});
