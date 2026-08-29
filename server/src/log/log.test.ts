import { describe, expect, test } from 'vitest';

import { must } from '../../test/helpers/assert.ts';
import { parseLogLine } from '../../test/helpers/log_lines.ts';
import { createLog, isLogLevel, LogLevel } from './log.ts';

/** Un puits qui capture les lignes, pour asserter sur ce qui est RÉELLEMENT écrit. */
function capture(): { lines: string[]; sink: (line: string) => void } {
  const lines: string[] = [];
  return { lines, sink: (line) => { lines.push(line); } };
}

describe('createLog', () => {
  test('writes one JSON line carrying the level and the message', () => {
    const { lines, sink } = capture();
    createLog(LogLevel.INFO, {}, sink).info('migration appliquée', { version: '001' });

    expect(lines).toHaveLength(1);
    expect(parseLogLine(must(lines[0]))).toMatchObject({
      level: 'info', message: 'migration appliquée', version: '001',
    });
  });

  test('drops what is below the configured level', () => {
    const { lines, sink } = capture();
    const log = createLog(LogLevel.WARN, {}, sink);
    log.debug('bruit');
    log.info('bruit');
    log.warn('gardé');
    log.error('gardé');

    expect(lines.map((line) => parseLogLine(line).message)).toEqual(['gardé', 'gardé']);
  });

  test('a child carries its parent fields — that is how a request id reaches every line', () => {
    const { lines, sink } = capture();
    createLog(LogLevel.INFO, { service: 'import' }, sink)
      .child({ requestId: 'abc' })
      .info('démarré');

    expect(parseLogLine(must(lines[0]))).toMatchObject({ service: 'import', requestId: 'abc' });
  });

  test('a child never mutates its parent', () => {
    const { lines, sink } = capture();
    const parent = createLog(LogLevel.INFO, {}, sink);
    parent.child({ requestId: 'abc' });
    parent.info('sans id');

    expect(parseLogLine(must(lines[0])).requestId).toBeUndefined();
  });

  test('every line carries a timestamp — a log without one cannot be correlated', () => {
    const { lines, sink } = capture();
    createLog(LogLevel.INFO, {}, sink).info('x');

    expect(parseLogLine(must(lines[0])).at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});

describe('isLogLevel', () => {
  test('accepts the four levels and rejects anything else', () => {
    for (const level of ['debug', 'info', 'warn', 'error']) {
      expect(isLogLevel(level)).toBe(true);
    }
    for (const nonsense of ['verbose', 'INFO', '', 'toString']) {
      expect(isLogLevel(nonsense)).toBe(false);
    }
  });
});
