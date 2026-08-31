import { DateKind, DatePrecision, DateSource, PositionSource } from '../../shared/enums';

import {
  CivilDayRangeSchema, IsoDateSchema, IsoTimestampSchema, LocalDateTimeSchema,
  ResolvedDateSchema, ResolvedPositionSchema, SingleDayRangeSchema,
} from './common';

const day = (start: string, end: string = start) => ({
  start, end, precision: DatePrecision.DAY,
  kind: DateKind.READING, source: DateSource.EXIF_ARBITRATED, bracketHours: null,
});

describe('IsoDate — a civil day, and a real one', () => {
  test('a real day parses', () => {
    expect(IsoDateSchema.parse('1999-10-14')).toBe('1999-10-14');
  });
  test('INVARIANT §9.6.4 — a pre-formatted date is refused', () => {
    expect(IsoDateSchema.safeParse('14 octobre 1999').success).toBe(false);
  });
  test('INVARIANT §9.6.5 — a civil day never carries a time or a zone', () => {
    expect(IsoDateSchema.safeParse('1999-10-14T00:00:00Z').success).toBe(false);
  });
  test.each(['1999-02-29', '1999-04-31', '1999-13-01', '1999-00-10'])(
    'a day the calendar does not have is refused: %s',
    (raw) => { expect(IsoDateSchema.safeParse(raw).success).toBe(false); },
  );
  test('a leap day that exists parses', () => {
    expect(IsoDateSchema.safeParse('2000-02-29').success).toBe(true);
  });
});

describe('IsoTimestamp — a real instant, always zoned', () => {
  test('a UTC instant parses', () => {
    expect(IsoTimestampSchema.parse('2026-08-28T13:13:10.077Z')).toBe('2026-08-28T13:13:10.077Z');
  });
  test('an instant without its zone is refused: it would be read as local', () => {
    expect(IsoTimestampSchema.safeParse('2026-08-28T13:13:10').success).toBe(false);
  });
  test('a civil day is not an instant', () => {
    expect(IsoTimestampSchema.safeParse('2026-08-28').success).toBe(false);
  });
});

describe('LocalDateTime — naive on purpose, never converted', () => {
  test('a naive local timestamp parses', () => {
    expect(LocalDateTimeSchema.parse('1999-10-14T15:02:00')).toBe('1999-10-14T15:02:00');
  });
  test('a zone on a capture time is refused: 76 % of them have none', () => {
    expect(LocalDateTimeSchema.safeParse('1999-10-14T15:02:00Z').success).toBe(false);
  });
});

describe('ResolvedDate — the interval must be an interval', () => {
  test('equal bounds are legal: a day is an interval of one', () => {
    expect(ResolvedDateSchema.safeParse(day('1999-10-14')).success).toBe(true);
  });
  test('an interval that ends before it starts is refused', () => {
    const result = ResolvedDateSchema.safeParse(day('1999-10-14', '1999-10-01'));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['end']);
  });
});

describe('ResolvedDate — a bracket belongs to a proposal and nothing else', () => {
  test('a bracket on a logbook proposal is kept', () => {
    expect(ResolvedDateSchema.safeParse({
      ...day('1999-10-14'), kind: DateKind.INFERENCE,
      source: DateSource.LOGBOOK_BRACKET, bracketHours: 96,
    }).success).toBe(true);
  });
  test('a bracket on an EXIF reading is refused, not silently displayed', () => {
    const result = ResolvedDateSchema.safeParse({ ...day('1999-10-14'), bracketHours: 96 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['bracketHours']);
  });
  test('a proposal with no bracket is legal — the UI says "sans fourchette"', () => {
    expect(ResolvedDateSchema.safeParse({
      ...day('1999-10-14'), kind: DateKind.INFERENCE,
      source: DateSource.LOGBOOK_BRACKET, bracketHours: null,
    }).success).toBe(true);
  });
});

describe('ResolvedPosition', () => {
  const position = {
    lat: 32.98, lon: -16.39, kind: DateKind.READING, source: PositionSource.EXIF,
  };
  test('a GPS fix is a reading', () => {
    expect(ResolvedPositionSchema.safeParse(position).success).toBe(true);
  });
  test('INVARIANT §7.1 — an interpolated position dressed as a reading is refused', () => {
    const result = ResolvedPositionSchema.safeParse({
      ...position, source: PositionSource.LOGBOOK_INTERPOLATED, kind: DateKind.READING,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['kind']);
  });
  test('an interpolated position declared an inference is kept', () => {
    expect(ResolvedPositionSchema.safeParse({
      ...position, source: PositionSource.LOGBOOK_INTERPOLATED, kind: DateKind.INFERENCE,
    }).success).toBe(true);
  });
  test.each([[91, 0], [-91, 0], [0, 181], [0, -181]])(
    'a coordinate off the globe is refused: %s, %s',
    (lat, lon) => {
      expect(ResolvedPositionSchema.safeParse({ ...position, lat, lon }).success).toBe(false);
    },
  );
  test('the poles and the antimeridian are legal', () => {
    expect(ResolvedPositionSchema.safeParse({ ...position, lat: 90, lon: 180 }).success).toBe(true);
  });
});

describe('CivilDayRange — what the user ASKS, not what the system asserts', () => {
  test('a range parses', () => {
    expect(CivilDayRangeSchema.parse({ from: '1998-01-01', to: '2004-12-31' }).from)
      .toBe('1998-01-01');
  });
  test('from and to may be equal: a single-day filter is legal', () => {
    expect(CivilDayRangeSchema.safeParse({ from: '1999-10-14', to: '1999-10-14' }).success)
      .toBe(true);
  });
  test('a range that ends before it starts is refused', () => {
    const result = CivilDayRangeSchema.safeParse({ from: '2004-01-01', to: '1998-01-01' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['to']);
  });
});

describe('SingleDayRange — v1.6, contract A10: a text date correction, one day or nothing', () => {
  test('equal start and end parse', () => {
    expect(SingleDayRangeSchema.parse({ start: '1999-10-14', end: '1999-10-14' }).start)
      .toBe('1999-10-14');
  });
  test('a range (start !== end) is refused — D11: a text asserts a day, never a span', () => {
    const result = SingleDayRangeSchema.safeParse({ start: '1999-10-14', end: '1999-10-15' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['end']);
  });
  test('a pre-formatted or invalid day is refused, same as IsoDateSchema everywhere else', () => {
    expect(SingleDayRangeSchema.safeParse({ start: '14 octobre 1999', end: '14 octobre 1999' }).success)
      .toBe(false);
  });
});
