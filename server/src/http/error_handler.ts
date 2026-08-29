import { randomUUID } from 'node:crypto';

import { ErrorCode } from '@shared/enums';
import { AppError } from '../contract/error_interface.ts';
import type { Log } from '../log/log.ts';

/**
 * LE seul endroit qui traduit une erreur du domaine en `ApiError` du contrat.
 *
 * Toute exception NON typée devient un `INTERNAL` avec un `traceId` : la trace
 * complète est journalisée, et RIEN du message d'origine ne part au client —
 * il peut porter une chaîne de connexion, un chemin, un mot de passe.
 */
export interface ApiErrorResponse {
  readonly status: number;
  readonly body: { readonly error: { readonly code: ErrorCode; readonly message: string;
                                     readonly details: unknown } };
}

export function toApiError(error: unknown, log: Log): ApiErrorResponse {
  if (error instanceof AppError) {
    // Une AppError est un comportement PRÉVU — un 404, un 409, un filtre
    // refusé. La journaliser comme une erreur interne noierait les vraies.
    return {
      status: error.httpStatus,
      body: { error: { code: error.code, message: error.message, details: error.details } },
    };
  }

  const traceId = randomUUID();
  log.error('erreur non typée', {
    traceId,
    stack: error instanceof Error ? error.stack : String(error),
  });

  return {
    status: 500,
    body: { error: { code: ErrorCode.INTERNAL, message: 'erreur interne', details: { traceId } } },
  };
}
