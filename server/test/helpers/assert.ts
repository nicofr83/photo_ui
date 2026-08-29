/**
 * A defined-or-throw helper for tests. `noUncheckedIndexedAccess` types
 * `array[0]` as `T | undefined`; a `!` would silence that instead of proving
 * it. This throws, naming what was expected — a test should fail loudly, not
 * coerce past its own check.
 */
export function must<T>(value: T | undefined, what = 'valeur attendue, absente'): T {
  if (value === undefined) throw new Error(what);
  return value;
}
