import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import { renderWithProviders } from '../test/renderWithProviders';

import { ConsigneScreen } from './ConsigneScreen';

// ConsigneScreen renders TaskNav, which needs a Router — the real app
// always provides one (app/router.tsx), so the test does too.
const setup = () =>
  renderWithProviders(<MemoryRouter><ConsigneScreen slug="1999-transat" /></MemoryRouter>);

describe('v1.5, Task 5 — the brief travels with the task', () => {
  test('the brief is editable', async () => {
    const user = userEvent.setup();
    setup();
    const field = await screen.findByLabelText(/consigne/i);
    await user.type(field, 'Raconter la traversée');
    expect(field).toHaveValue('Raconter la traversée');
  });

  test('saving actually persists it — typing alone used to go nowhere', async () => {
    const user = userEvent.setup();
    setup();
    const field = await screen.findByLabelText(/consigne/i);
    await user.type(field, 'Raconter la traversée');
    await user.click(screen.getByRole('button', { name: /enregistrer la consigne/i }));

    // Démonter et remonter prouve que l'enregistrement a atteint le serveur —
    // un test qui ne vérifie que la frappe locale passe sur un bouton qui
    // ne fait rien.
    const { unmount } = setup();
    unmount();
    const secondMount = setup();
    expect(await secondMount.findByLabelText(/consigne/i)).toHaveValue('Raconter la traversée');
  });

  test('the save button is disabled until something actually changed', async () => {
    setup();
    const button = await screen.findByRole('button', { name: /enregistrer la consigne/i });
    expect(button).toBeDisabled();
  });
});

describe('v1.5, Task 5 — the task period, month/year, typable without a mouse', () => {
  test('no period declared says so', async () => {
    setup();
    expect(await screen.findByText(/aucune période déclarée/i)).toBeInTheDocument();
  });

  test('saving is blocked until both months are filled in', async () => {
    const user = userEvent.setup();
    setup();
    const button = await screen.findByRole('button', { name: /enregistrer la période/i });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText(/premier mois/i), '1998-06');
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText(/dernier mois/i), '1998-12');
    expect(button).toBeEnabled();
  });

  test('saving a complete range persists the real civil-day bounds and shows them', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(await screen.findByLabelText(/premier mois/i), '1998-06');
    await user.type(screen.getByLabelText(/dernier mois/i), '1998-12');
    await user.click(screen.getByRole('button', { name: /enregistrer la période/i }));

    expect(await screen.findByText('Actuellement : 1998-06-01 → 1998-12-31')).toBeInTheDocument();
  });

  test('a declared period can be cleared', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(await screen.findByLabelText(/premier mois/i), '1998-06');
    await user.type(screen.getByLabelText(/dernier mois/i), '1998-12');
    await user.click(screen.getByRole('button', { name: /enregistrer la période/i }));
    await screen.findByText(/actuellement/i);

    await user.click(screen.getByRole('button', { name: /effacer la période/i }));
    expect(await screen.findByText(/aucune période déclarée/i)).toBeInTheDocument();
  });
});

describe('v1.5, Task 13 — the delivery directory, confined under TASKS_ROOT', () => {
  // Plan deviation: `tache-a` (the plan's slug) is not a seeded task — its
  // GET /tasks/:slug would 404 and the whole screen would show ErrorBanner
  // instead of the form. `1999-transat` (this file's own existing slug,
  // `exportDirectory: null` — the field starts empty) is used instead, same
  // reasoning as PageDetail.test.tsx's Task 9 deviation.
  test('le répertoire de livraison d’une tâche est réglable, et son refus est nommé', async () => {
    const user = userEvent.setup();
    setup();
    const champ = await screen.findByLabelText('Répertoire de livraison');
    await user.type(champ, '../ailleurs');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le répertoire' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/doit rester sous TASKS_ROOT/);
  });
});
