import { AlbumListSchema } from './album';
import { WebDocumentListSchema } from './ref';
import { SystemStatusSchema } from './system';
import { TaskNoteSchema } from './task';
import { TextFacetsSchema, TextPageListSchema, TextUnitListSchema } from './text';

/**
 * v1.5, Task 14. The V1's costliest defects were never logic bugs — a shape
 * disagreement: an array where the server sent counts, a 202 where the
 * client expected a 409. Both suites were green, and the MSW mock agreed
 * with the client, both disagreeing with the real server. This is the only
 * test that asks the question neither of them did.
 *
 * Excluded from `npm test` (vitest.config.ts's `live` project, run only via
 * `npm run test:live`) — it needs the real server running:
 * `cd server && npm run dev`.
 */
const BASE = 'http://127.0.0.1:4310';

test.each([
  ['/pages?documentId=ma-vie', TextPageListSchema],
  ['/texts?documentId=ma-vie', TextUnitListSchema],
  ['/texts/facets?documentId=ma-vie', TextFacetsSchema],
  ['/ref/web-documents', WebDocumentListSchema],
  ['/albums', AlbumListSchema],
  ['/system/status', SystemStatusSchema],
] as const)('%s : la vraie réponse satisfait le schéma réel', async (path, schema) => {
  const response = await fetch(`${BASE}${path}`);
  expect(response.status).toBe(200);
  // Afficher les champs qui divergent, pas seulement « invalide ».
  const parsed = schema.safeParse(await response.json());
  expect(parsed.error?.issues ?? []).toEqual([]);
});

test('POST /tasks/:slug/notes accepte le corps que le client envoie vraiment', async () => {
  // Plan deviation: `zz-integration` n'est pas semée sur le vrai serveur —
  // `zz-repro-bug1`, une tâche de reproduction déjà là (donc jetable par
  // construction), à la place plutôt que d'en créer une nouvelle.
  const response = await fetch(`${BASE}/tasks/zz-repro-bug1/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'journal de bord, page 3 du 09/07/1998',
      text: 'Départ.',
      attachedTo: { images: [], texts: [{ kind: 'passage', id: 'logbook/p003/001' }] },
      derivedFrom: { kind: 'passage', id: 'logbook/p003/001' },
    }),
  });
  expect(response.status).toBe(201);
  const parsed = TaskNoteSchema.safeParse(await response.json());
  expect(parsed.error?.issues ?? []).toEqual([]);
});
