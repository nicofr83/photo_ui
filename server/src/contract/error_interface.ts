import type { ErrorCode } from '@shared/enums';

/**
 * L'erreur du domaine. Une seule enveloppe traverse l'API — `ApiError` du
 * contrat §2.3 — et `http/error_handler.ts` est le seul endroit qui traduit.
 *
 * Les erreurs REMONTENT jusqu'à la frontière transactionnelle : aucun `catch`
 * intermédiaire ne les avale, un `catch` n'existe que pour enrichir puis
 * relancer. Toute exception NON typée devient un `INTERNAL` avec un `traceId`,
 * et rien du message d'origine ne part au client.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly httpStatus: number,
    readonly details: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
