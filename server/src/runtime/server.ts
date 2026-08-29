import Fastify, { type FastifyInstance } from 'fastify';

import { ErrorCode } from '@shared/enums';
import { AppError } from '../contract/error_interface.ts';
import type { Log } from '../log/log.ts';
import { toApiError } from '../http/error_handler.ts';

/**
 * L'instance Fastify NUE : gestion d'erreur, 404, `bodyLimit`. Aucune route
 * métier ici — `bootstrap.ts` les enregistre après, une fois les dépendances
 * construites.
 */
export function buildServer(log: Log): FastifyInstance {
  const server = Fastify({
    // « Tout sélectionner » sur 3 930 résultats envoie ≈ 216 Ko : 2 Mio porté
    // explicitement plutôt que de dépendre du défaut de Fastify, invisible.
    bodyLimit: 2 * 1024 * 1024,
    logger: false,   // le service Log est injecté ; Fastify n'écrit rien lui-même
  });

  // Toute route absente devient un ApiError JSON — jamais la page HTML par défaut.
  server.setNotFoundHandler((request, reply) => {
    const { status, body } = toApiError(
      new AppError(ErrorCode.NOT_FOUND, `route inconnue : ${request.method} ${request.url}`, 404,
                   { method: request.method, url: request.url }),
      log,
    );
    void reply.status(status).send(body);
  });

  // LE seul endroit qui traduit une exception en réponse — toute route la laisse remonter.
  server.setErrorHandler((error, _request, reply) => {
    const { status, body } = toApiError(error, log);
    void reply.status(status).send(body);
  });

  return server;
}
