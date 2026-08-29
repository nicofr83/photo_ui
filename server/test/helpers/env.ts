/**
 * Typed access to a required environment variable, for tests.
 *
 * `process.env[name]` is `string | undefined` under `strict`, and a bare `!`
 * would silence that — exactly the failure mode `noUncheckedIndexedAccess`
 * exists to catch. This throws instead, naming the variable.
 */
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} manquant`);
  }
  return value;
}
