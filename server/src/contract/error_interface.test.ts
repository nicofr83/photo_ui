import { expect, test } from 'vitest';

import { ErrorCode } from '@shared/enums';
import { AppError } from './error_interface.ts';

test('carries the code, the HTTP status and the typed details of the contract', () => {
  const error = new AppError(
    ErrorCode.UNKNOWN_PARAMETER, 'paramètre inconnu : albumPaht', 400,
    { parameters: ['albumPaht'], accepted: ['albumPath'] },
  );

  expect(error.code).toBe('UNKNOWN_PARAMETER');
  expect(error.httpStatus).toBe(400);
  expect(error.details).toEqual({ parameters: ['albumPaht'], accepted: ['albumPath'] });
  expect(error.message).toBe('paramètre inconnu : albumPaht');
});

test('is a real Error — a catch that filters on Error must see it', () => {
  const error = new AppError(ErrorCode.NOT_FOUND, 'absent', 404, { resource: 'photo', id: 'x' });

  expect(error).toBeInstanceOf(Error);
  expect(error).toBeInstanceOf(AppError);
  expect(error.name).toBe('AppError');
  expect(error.stack).toEqual(expect.any(String));
});

test('the coded values come from the SHARED module, never from an inline literal', () => {
  // Si le module partagé changeait une valeur, ce test le dirait ici plutôt
  // qu'à l'intégration avec le client.
  expect(ErrorCode.VOLUME_UNAVAILABLE).toBe('VOLUME_UNAVAILABLE');
  expect(new AppError(ErrorCode.VOLUME_UNAVAILABLE, 'volume démonté', 503,
                      { root: '/Volumes/x', envVar: 'ORIGINALS_ROOT' }).code)
    .toBe(ErrorCode.VOLUME_UNAVAILABLE);
});
