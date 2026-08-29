import { describe, expect, test } from 'vitest';

import { ErrorCode } from '@shared/enums';
import { AppError } from '../contract/error_interface.ts';
import { must } from '../../test/helpers/assert.ts';
import { parseLogLine } from '../../test/helpers/log_lines.ts';
import { createLog, LogLevel } from '../log/log.ts';
import { toApiError } from './error_handler.ts';

/** Un journal qui capture, pour vérifier ce qui est réellement écrit. */
function capturingLog(): { lines: string[]; log: ReturnType<typeof createLog> } {
  const lines: string[] = [];
  return { lines, log: createLog(LogLevel.DEBUG, {}, (line) => { lines.push(line); }) };
}

describe('a typed AppError travels as-is', () => {
  test('keeps its code, status, message and details', () => {
    const { log } = capturingLog();
    const { status, body } = toApiError(
      new AppError(ErrorCode.SLUG_TAKEN, 'slug déjà pris', 409,
                   { slug: 'transat', existingTaskTitle: 'La transat' }),
      log,
    );

    expect(status).toBe(409);
    expect(body).toEqual({
      error: {
        code: 'SLUG_TAKEN',
        message: 'slug déjà pris',
        details: { slug: 'transat', existingTaskTitle: 'La transat' },
      },
    });
  });

  test('the envelope is always { error: { code, message, details } }', () => {
    const { log } = capturingLog();
    const { body } = toApiError(
      new AppError(ErrorCode.NOT_FOUND, 'absente', 404, { resource: 'photo', id: 'x' }), log);

    expect(Object.keys(body as object)).toEqual(['error']);
    expect(Object.keys((body as { error: object }).error).sort())
      .toEqual(['code', 'details', 'message']);
  });
});

describe('an untyped exception becomes an INTERNAL, and says nothing more', () => {
  test('is a 500 carrying only a traceId', () => {
    const { log } = capturingLog();
    const { status, body } = toApiError(new Error('connexion refusée sur 5432'), log);

    expect(status).toBe(500);
    const error = (body as { error: { code: string; details: { traceId: string } } }).error;
    expect(error.code).toBe('INTERNAL');
    expect(error.details.traceId).toEqual(expect.any(String));
  });

  test('NOTHING of the original message reaches the client', () => {
    const { log } = capturingLog();
    const { body } = toApiError(new Error('password=Funiculi host=localhost'), log);

    expect(JSON.stringify(body)).not.toContain('Funiculi');
    expect(JSON.stringify(body)).not.toContain('localhost');
  });

  test('but the full trace IS logged, under the same traceId', () => {
    const { lines, log } = capturingLog();
    const { body } = toApiError(new Error('connexion refusée sur 5432'), log);

    const traceId = (body as { error: { details: { traceId: string } } }).error.details.traceId;
    expect(lines).toHaveLength(1);
    const logged = parseLogLine(must(lines[0]));
    expect(logged.traceId).toBe(traceId);
    expect(logged.level).toBe('error');
    expect(logged.stack).toContain('connexion refusée sur 5432');
  });

  test('a thrown non-Error is handled too — never a crash inside the handler', () => {
    const { log } = capturingLog();
    expect(toApiError('juste une chaîne', log).status).toBe(500);
    expect(toApiError(undefined, log).status).toBe(500);
    expect(toApiError({ weird: true }, log).status).toBe(500);
  });

  test('two failures get two different traceIds', () => {
    const { log } = capturingLog();
    const first = toApiError(new Error('a'), log) as { body: { error: { details: { traceId: string } } } };
    const second = toApiError(new Error('b'), log) as { body: { error: { details: { traceId: string } } } };
    expect(first.body.error.details.traceId).not.toBe(second.body.error.details.traceId);
  });

  test('a typed AppError is NOT logged as an internal error — it is expected behaviour', () => {
    const { lines, log } = capturingLog();
    toApiError(new AppError(ErrorCode.NOT_FOUND, 'absente', 404, { resource: 'p', id: 'x' }), log);
    expect(lines).toEqual([]);
  });
});
