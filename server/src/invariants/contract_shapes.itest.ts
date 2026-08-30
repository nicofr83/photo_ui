import { afterAll, beforeAll, expect, test } from 'vitest';

// Les schémas Zod du CLIENT — appliqués ici aux réponses du VRAI serveur,
// contre le VRAI corpus. Les défauts les plus coûteux de la V1 n'étaient pas
// des bugs de logique : c'était un désaccord de FORME entre client et
// serveur alors que les deux suites étaient vertes séparément. C'est la
// seule question qu'aucune des deux ne posait (v1.5, Task 15).
import { TaskDetailSchema } from '../../../src/api/contract/task.ts';
import { TextPageListSchema } from '../../../src/api/contract/text.ts';
import { WebDocumentListSchema } from '../../../src/api/contract/ref.ts';
import { bootstrap, type App } from '../runtime/bootstrap.ts';

/**
 * DÉLIBÉRÉMENT contre `DATABASE_URL` (le corpus réel), jamais
 * `DATABASE_URL_TEST` — `photo_ui_test` est vide sauf ce qu'un test y insère
 * lui-même, et les identifiants ci-dessous (`01-le-grand-depart`, `ma-vie`)
 * n'existent que dans le vrai corpus. Aucune route mutante n'est jamais
 * appelée ici (uniquement des `GET`) — `bootstrap()` ne rejoue aucune
 * migration et n'écrit rien au démarrage (`createSafeFs` ne fait que lire),
 * donc rien ne touche le travail humain réel malgré la connexion au corpus
 * de travail.
 */
let app: App;

beforeAll(async () => {
  app = await bootstrap(process.env);
}, 30_000);

afterAll(async () => { await app.close(); });

const CASES = [
  ['/tasks/01-le-grand-depart', TaskDetailSchema],
  ['/pages?documentId=ma-vie', TextPageListSchema],
  ['/ref/web-documents', WebDocumentListSchema],
] as const;

test.each(CASES)('%s satisfies the schema the client actually applies', async (url, schema) => {
  const response = await app.server.inject({ method: 'GET', url });
  expect(response.statusCode).toBe(200);
  const parsed = schema.safeParse(response.json());
  expect(parsed.error?.issues ?? []).toEqual([]);
});
