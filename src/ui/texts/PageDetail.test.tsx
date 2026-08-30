import { screen, within } from '@testing-library/react';

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
