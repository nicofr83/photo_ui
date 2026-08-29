import type { FastifyInstance } from 'fastify';

import type { Pool } from '../db/pool.ts';
import type { Album } from '../contract/photo_interface.ts';
import { listAlbums } from '../repository/album_repository.ts';

/** Lecture seule pour l'instant — les mutations (`PUT`/`DELETE /ref/album-span`) viendront à la tâche 25. */
export function registerRefRoutes(server: FastifyInstance, deps: { pool: Pool }): void {
  const { pool } = deps;

  server.get('/albums', async (): Promise<{ items: readonly Album[] }> => {
    const client = await pool.connect();
    try {
      return { items: await listAlbums(client) };
    } finally {
      client.release();
    }
  });
}
