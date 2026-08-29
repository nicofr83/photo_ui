import { describe, expect, test } from 'vitest';

import { parseCaptureDate } from './capture_date.ts';

describe('parseCaptureDate — splits the raw string, never converts', () => {
  test('null stays null in all three fields', () => {
    expect(parseCaptureDate(null)).toEqual({ local: null, offsetMin: null, raw: null });
  });

  test('no timezone at all — offsetMin is NULL, not 0', () => {
    expect(parseCaptureDate('2000-12-14T11:42:23'))
      .toEqual({ local: '2000-12-14T11:42:23', offsetMin: null, raw: '2000-12-14T11:42:23' });
  });

  test('a trailing Z is an explicit UTC, offsetMin is 0 — distinct from "no zone"', () => {
    expect(parseCaptureDate('2000-12-14T11:42:23Z'))
      .toEqual({ local: '2000-12-14T11:42:23', offsetMin: 0, raw: '2000-12-14T11:42:23Z' });
  });

  test('fractional seconds with no zone: kept in local, offset still NULL', () => {
    expect(parseCaptureDate('2000-12-14T11:42:23.36'))
      .toEqual({ local: '2000-12-14T11:42:23.36', offsetMin: null, raw: '2000-12-14T11:42:23.36' });
  });

  test('fractional seconds with a trailing Z', () => {
    expect(parseCaptureDate('2000-12-14T11:42:23.000Z'))
      .toEqual({ local: '2000-12-14T11:42:23.000', offsetMin: 0, raw: '2000-12-14T11:42:23.000Z' });
  });

  test('a positive offset is read in minutes, the zone stripped from local', () => {
    expect(parseCaptureDate('2000-12-14T11:42:23+02:00'))
      .toEqual({ local: '2000-12-14T11:42:23', offsetMin: 120, raw: '2000-12-14T11:42:23+02:00' });
  });

  test('a negative offset, and fractional seconds together', () => {
    expect(parseCaptureDate('2000-12-14T11:42:23.780+04:00'))
      .toEqual({ local: '2000-12-14T11:42:23.780', offsetMin: 240, raw: '2000-12-14T11:42:23.780+04:00' });
  });

  test('a genuinely negative offset (west of Greenwich)', () => {
    expect(parseCaptureDate('2000-12-14T11:42:23-05:30'))
      .toEqual({ local: '2000-12-14T11:42:23', offsetMin: -330, raw: '2000-12-14T11:42:23-05:30' });
  });
});
