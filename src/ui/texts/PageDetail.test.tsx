import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { server } from '../../../mocks/node';
import { renderWithProviders } from '../../test/renderWithProviders';

import { PageDetail } from './PageDetail';

// Plan deviation: `PageDetail` needs a task slug (text selection is
// task-scoped, contract §4.5, same as every other screen under a task) —
// the plan's snippet omits it. `1999-transat` is the existing seeded task
// fixture (used throughout the suite), chosen over the plan's `tache-a` so
// the selection query does not 404 on every render.
const render = (pageId: string) =>
  renderWithProviders(<PageDetail pageId={pageId} slug="1999-transat" onShowPhotos={() => {}} />);

describe('v1.5, Task 9 — the page ouverte, two natures of text', () => {
  test('le scan entier à droite, jamais découpé', async () => {
    render('logbook/p010');
    // Plan deviation: PageViewer's alt is "Page 10" (capital P, spec's own
    // convention) — the plan's regex lacks the `i` flag it needs to match.
    const image = await screen.findByRole('img', { name: /page 10/i });
    expect(image).toHaveAttribute('src', '/pages/image?pageId=logbook%2Fp010');
    expect(image).not.toHaveAttribute('data-crop');
  });

  test('le journal sépare le registre des notes de bord, chacun sa numérotation', async () => {
    render('logbook/p010');
    expect(await screen.findByRole('heading', { name: 'Registre' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Notes de bord' })).toBeInTheDocument();

    // La ligne 11 existe des deux côtés avec un contenu différent : c'est la
    // ligne 11 du haut et celle du bas, pas un doublon.
    const registre = within(screen.getByTestId('block-register')).getAllByTestId(/^text-/);
    const notes = within(screen.getByTestId('block-notes')).getAllByTestId(/^text-/);
    expect(registre.length).toBeGreaterThan(0);
    expect(notes.length).toBeGreaterThan(0);
  });

  test('« Ma vie » n’a qu’un bloc, sans titre de registre', async () => {
    render('ma-vie/p003');
    await screen.findByTestId('block-notes');
    expect(screen.queryByRole('heading', { name: 'Registre' })).toBeNull();
  });

  test('chaque texte garde sa coche, sa correction et son compte d’images', async () => {
    render('ma-vie/p003');
    const texte = (await screen.findAllByTestId(/^text-/))[0];
    expect(texte).toBeDefined();
    expect(within(texte as HTMLElement).getByRole('checkbox')).toBeInTheDocument();
    expect(within(texte as HTMLElement).getByRole('button', { name: /Corriger/ })).toBeInTheDocument();
    expect(within(texte as HTMLElement).getByRole('button', { name: /image/ })).toBeInTheDocument();
  });
});

describe('wiring (v1.5, post-plan) — NoteFromTextButton reuses the same checkbox', () => {
  test('no text checked, no button to create a note', async () => {
    render('ma-vie/p003');
    await screen.findAllByTestId(/^text-/);
    expect(screen.queryByRole('button', { name: 'Créer une note' })).not.toBeInTheDocument();
  });

  test('checking a text reveals the button, and creating a note derives from it', async () => {
    const user = userEvent.setup();
    let notesBody: unknown = null;
    server.use(
      http.post('*/tasks/1999-transat/notes', async ({ request }) => {
        notesBody = await request.json();
        return HttpResponse.json({
          id: 'note-x', title: 'x', text: 'x', createdAt: '2026-08-30T00:00:00.000Z',
          updatedAt: '2026-08-30T00:00:00.000Z', attachedTo: { images: [], texts: [] },
          derivedFrom: null, editedSince: false, quotable: false,
        });
      }),
    );

    render('ma-vie/p003');
    const texte = (await screen.findAllByTestId(/^text-/))[0] as HTMLElement;
    // The real /texts handler runs (unmocked): checking is a genuine task
    // selection, not a stand-in — the button only appears once it actually
    // persisted (task.data.texts, invalidated by the mutation).
    await user.click(within(texte).getByRole('checkbox'));
    const button = await screen.findByRole('button', { name: 'Créer une note' });

    // Counted only from here: checking the text above legitimately called
    // /texts once already — that is not what this assertion is about.
    let textsCallsAfterChecking = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.includes('/texts')) textsCallsAfterChecking += 1;
    });

    await user.click(button);

    await waitFor(() => { expect(notesBody).not.toBeNull(); });
    const envoye = notesBody as { title: string; derivedFrom: unknown };
    // "ma vie, page 3 du 06/08/1999" — the page's OWN date (Task 1), matching
    // the fixture (ma-vie/p003, a reading, 1999-08-06).
    expect(envoye.title).toBe('ma vie, page 3 du 06/08/1999');
    expect(envoye.derivedFrom).toEqual({ kind: 'passage', id: 'ma-vie/p003/001' });
    // Checking the text for the task and gathering it into a note is the
    // same gesture — creating the note must not check anything a SECOND time.
    expect(textsCallsAfterChecking).toBe(0);
  });
});
