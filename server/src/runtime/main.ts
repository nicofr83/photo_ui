import { bootstrap } from './bootstrap.ts';
import { loadConfig } from './config.ts';

const config = loadConfig(process.env);
const app = await bootstrap(process.env);

await app.server.listen({ host: config.host, port: config.port });

// Arrêt propre : le pool se ferme APRÈS que Fastify a fini de servir ses
// requêtes en vol, jamais avant.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.close()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
}
