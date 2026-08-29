/**
 * `Log` writes one JSON object per line (see `src/log/log.ts`). `JSON.parse`
 * is typed `any`; this is the one place that casts it, so no test does its
 * own unchecked cast.
 */
export interface LoggedLine {
  readonly at: string;
  readonly level: string;
  readonly message: string;
  readonly [field: string]: unknown;
}

export function parseLogLine(line: string): LoggedLine {
  return JSON.parse(line) as LoggedLine;
}
