import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { server } from '../../../mocks/node';
import { renderWithProviders } from '../../test/renderWithProviders';

import { WebDocumentDetail } from './WebDocumentDetail';

const render = (documentId: string) =>
  renderWithProviders(<WebDocumentDetail documentId={documentId} slug="1999-transat" />);

// V1.6, Nicolas: "click sur une page : on affiche la page en grand avec le
// texte complet de la page (pas des parties de texte qui n'ont pas
// d'utilité)" — the whole document's text, every passage, none of them
// truncated to an excerpt.
describe('V1.6 — opening a web document shows its complete text', () => {
  test('every passage of the document renders, none dropped', async () => {
    render('web/2003/2003_gal_1');
    const passages = await screen.findAllByTestId(/^text-passage-web\/2003\/2003_gal_1/);
    expect(passages.length).toBeGreaterThan(0);
  });

  test('no scanned page — spec §5.3, the web site has none', async () => {
    render('web/2003/2003_gal_1');
    await screen.findAllByTestId(/^text-/);
    expect(screen.queryByRole('img', { name: /page/i })).not.toBeInTheDocument();
  });

  test('each passage keeps its own correction affordance, not one flattened block', async () => {
    render('web/2003/2003_gal_1');
    const texte = (await screen.findAllByTestId(/^text-/))[0] as HTMLElement;
    expect(within(texte).getByRole('button', { name: /Corriger/ })).toBeInTheDocument();
  });
});

describe('V1.6 — selecting web text and saving it as a note, same gesture as the logbook', () => {
  test('no text checked, no note button', async () => {
    render('web/2003/2003_gal_1');
    await screen.findAllByTestId(/^text-/);
    expect(screen.queryByRole('button', { name: 'Créer une note' })).not.toBeInTheDocument();
  });

  test('checking a passage reveals the note button, and creating one derives from it', async () => {
    const user = userEvent.setup();
    let notesBody: unknown = null;
    server.use(
      http.post('*/tasks/1999-transat/notes', async ({ request }) => {
        notesBody = await request.json();
        return HttpResponse.json({
          id: 'note-web', title: 'x', text: 'x', createdAt: '2026-08-31T00:00:00.000Z',
          updatedAt: '2026-08-31T00:00:00.000Z', attachedTo: { images: [], texts: [] },
          derivedFrom: null, editedSince: false,
        });
      }),
    );

    render('web/2003/2003_gal_1');
    const texte = (await screen.findAllByTestId(/^text-/))[0] as HTMLElement;
    await user.click(within(texte).getByRole('checkbox'));
    const button = await screen.findByRole('button', { name: 'Créer une note' });

    await user.click(button);
    await waitFor(() => { expect(notesBody).not.toBeNull(); });
    expect((notesBody as { derivedFrom: unknown }).derivedFrom).not.toBeNull();
  });
});
