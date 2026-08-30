import { AlbumListSchema } from './album';
import { WebDocumentListSchema } from './ref';
import { SystemStatusSchema } from './system';
import { TaskNoteSchema } from './task';
import { TextFacetsSchema, TextPageListSchema, TextUnitListSchema } from './text';
import { attributionTitle } from '../../domain/noteTitle';
import { TextSource } from '../../domain/textSource';

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
  // The title is PRODUCED by the client's own attributionTitle, not a
  // hardcoded literal — logbook/p003's real date is 1998-07-09 (checked
  // live: GET /pages?documentId=logbook). This is the exact assertion the
  // plan's self-review named as the trap: the two copies of this rule
  // (noteTitle.ts here, note_title.ts server-side) must produce/recognize
  // the identical prefix, or a note created here would immediately refuse
  // its own PATCH.
  const title = attributionTitle({ source: TextSource.LOGBOOK, ordinal: 3, date: '1998-07-09' });
  expect(title).toBe('journal de bord, page 3 du 09/07/1998');

  // Plan deviation: `zz-integration` n'est pas semée sur le vrai serveur —
  // `zz-repro-bug1`, une tâche de reproduction déjà là (donc jetable par
  // construction), à la place plutôt que d'en créer une nouvelle.
  const response = await fetch(`${BASE}/tasks/zz-repro-bug1/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title,
      text: 'Départ.',
      attachedTo: { images: [], texts: [{ kind: 'passage', id: 'logbook/p003/001' }] },
      derivedFrom: { kind: 'passage', id: 'logbook/p003/001' },
    }),
  });
  expect(response.status).toBe(201);
  const created: unknown = await response.json();
  const parsed = TaskNoteSchema.safeParse(created);
  expect(parsed.error?.issues ?? []).toEqual([]);
  const noteId = (created as { id: string }).id;

  // The prefix survives an append (what NoteFromTextButton's own note stays
  // editable for afterwards, spec): a title extending it past an em dash
  // is accepted.
  const kept = await fetch(`${BASE}/tasks/zz-repro-bug1/notes/${noteId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: `${title} — à relire` }),
  });
  expect(kept.status).toBe(200);

  // Dropping the prefix outright is the refusal the lock exists for.
  const stripped = await fetch(`${BASE}/tasks/zz-repro-bug1/notes/${noteId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'un titre qui a perdu son attribution' }),
  });
  expect(stripped.status).toBe(422);
  const refusal: unknown = await stripped.json();
  expect((refusal as { error: { code: string } }).error.code).toBe('ATTRIBUTION_PREFIX_REMOVED');
});
