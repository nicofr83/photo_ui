import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { server } from '../../../mocks/node';
import { renderWithProviders } from '../../test/renderWithProviders';
import { INVARIANT_TEXTS } from '../../../fixtures/invariants/texts';

import { NoteFromTextButton } from './NoteFromTextButton';

const unit = INVARIANT_TEXTS.find((t) => t.ref.id === 'ma-vie/p007/002');
if (unit === undefined) throw new Error('fixture missing: ma-vie/p007/002');

describe('v1.5, Task 11 — creating a note from a checked text', () => {
  test('la note recopie le texte, le rattache, et ne coche pas le passage', async () => {
    let notesBody: unknown = null;
    let textsCalls = 0;
    server.use(
      http.post('*/tasks/tache-a/notes', async ({ request }) => {
        notesBody = await request.json();
        return HttpResponse.json({
          id: 'note-1', title: 'x', text: 'x', createdAt: '2026-08-30T00:00:00.000Z',
          updatedAt: '2026-08-30T00:00:00.000Z', attachedTo: { images: [], texts: [] },
          derivedFrom: null, editedSince: false,
        });
      }),
      http.post('*/tasks/tache-a/texts', () => { textsCalls += 1; return HttpResponse.json({}); }),
    );

    renderWithProviders(<NoteFromTextButton slug="tache-a" selected={[unit]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Créer une note' }));

    await waitFor(() => { expect(notesBody).not.toBeNull(); });
    const envoye = notesBody as { text: string; derivedFrom: unknown; attachedTo: { texts: unknown[] } };
    expect(envoye.text).toBe(unit.text);
    expect(envoye.derivedFrom).toEqual(unit.ref);
    expect(envoye.attachedTo.texts).toEqual([unit.ref]);
    // Sending the same words into journal.md/ma-vie.md too would read to the
    // LLM as two independent sources agreeing — the passage is never re-selected.
    expect(textsCalls).toBe(0);
  });
});
