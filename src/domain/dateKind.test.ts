import { DateKind, DateSource } from '../shared/enums';

import { KindDisagreementError, expectedKindFor, assertKindConsistent } from './dateKind';

/**
 * The canonical table, spec §7.1 + contract §2.1.
 * `kind` is DERIVED, never supplied — the server computes it. This table is the
 * client-side cross-check: if the server ever sends a pair that disagrees with
 * it, we must fail loudly rather than render an inference as a reading.
 */
const CANONICAL: ReadonlyArray<readonly [DateSource, DateKind]> = [
  [DateSource.ANNOTATION, DateKind.DECISION],
  [DateSource.EXIF_ARBITRATED, DateKind.READING],
  [DateSource.LOGBOOK_BRACKET, DateKind.INFERENCE],
  [DateSource.ALBUM_MONTH, DateKind.INFERENCE],
  [DateSource.ALBUM_YEAR, DateKind.INFERENCE],
  [DateSource.PASSAGE_DATE_FROM, DateKind.READING],
  [DateSource.LOG_ENTRY_DATE, DateKind.READING],
  [DateSource.PAGE_WINDOW, DateKind.INFERENCE],
  [DateSource.WEB_SPAN, DateKind.DECISION],
];

describe('expectedKindFor', () => {
  test.each(CANONICAL)('%s is a %s', (source, kind) => {
    expect(expectedKindFor(source)).toBe(kind);
  });

  test('every DateSource in the shared enum has a kind', () => {
    const covered = CANONICAL.map(([source]) => source).sort();
    expect(covered).toEqual(Object.values(DateSource).sort());
  });

  test('only EXIF and the two text readings are readings', () => {
    const readings = CANONICAL.filter(([, k]) => k === DateKind.READING).map(([s]) => s);
    expect(readings.sort()).toEqual(
      [
        DateSource.EXIF_ARBITRATED,
        DateSource.LOG_ENTRY_DATE,
        DateSource.PASSAGE_DATE_FROM,
      ].sort(),
    );
  });
});

describe('INVARIANT §7.1 — a disagreeing (source, kind) pair must fail loudly', () => {
  test('a consistent pair passes', () => {
    expect(() => {
      assertKindConsistent(DateSource.ALBUM_MONTH, DateKind.INFERENCE);
    }).not.toThrow();
  });

  test('an inference dressed up as a reading throws', () => {
    expect(() => {
      assertKindConsistent(DateSource.ALBUM_MONTH, DateKind.READING);
    }).toThrow(KindDisagreementError);
  });

  test('the error names the source, the received kind and the expected one', () => {
    const error = (() => {
      try {
        assertKindConsistent(DateSource.ALBUM_MONTH, DateKind.READING);
        return null;
      } catch (caught: unknown) {
        return caught as KindDisagreementError;
      }
    })();
    expect(error).toBeInstanceOf(KindDisagreementError);
    expect(error?.source).toBe(DateSource.ALBUM_MONTH);
    expect(error?.received).toBe(DateKind.READING);
    expect(error?.expected).toBe(DateKind.INFERENCE);
  });

  test.each(CANONICAL)('%s never passes as any other kind', (source, expected) => {
    for (const kind of Object.values(DateKind)) {
      if (kind === expected) continue;
      expect(() => {
        assertKindConsistent(source, kind);
      }).toThrow(KindDisagreementError);
    }
  });
});

describe('a source outside the closed vocabulary fails loudly', () => {
  test('an upstream dateSource value is not silently accepted', () => {
    // `folder-sequence` is a raw pipeline value, never a contract DateSource.
    expect(() => expectedKindFor('folder-sequence' as DateSource)).toThrow(
      /unmapped DateSource/,
    );
  });
});
