import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { store } from '../../mocks/store';
import { renderWithProviders } from '../test/renderWithProviders';

import { TasksScreen } from './TasksScreen';

const opened: string[] = [];
const setup = () => {
  opened.length = 0;
  return renderWithProviders(<TasksScreen onOpen={(slug) => opened.push(slug)} />);
};

describe('§5.1 — the list', () => {
  test('shows each task with its counts and state', async () => {
    setup();
    const row = await screen.findByTestId('task-1999-transat');
    expect(row).toHaveTextContent('La transat, septembre-octobre 1999');
    expect(row).toHaveTextContent(/1 image/);
    expect(row).toHaveTextContent(/brouillon/i);
  });

  test('opening a task reports its slug', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /Ouvrir La transat/ }));
    expect(opened).toEqual(['1999-transat']);
  });

  test('the actions are buttons, not hover targets', async () => {
    setup();
    expect(await screen.findByRole('button', { name: /Ouvrir La transat/ })).toBeVisible();
  });
});

describe('§5.1 — creating a task', () => {
  test('the slug is derived from the title as it is typed', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText(/titre/i), 'Été 2004 — Belize');
    expect(screen.getByLabelText(/identifiant du dossier/i)).toHaveValue('ete-2004-belize');
  });

  test('the slug can be overridden at creation', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText(/titre/i), 'Belize');
    await user.clear(screen.getByLabelText(/identifiant du dossier/i));
    await user.type(screen.getByLabelText(/identifiant du dossier/i), 'belize-2004');
    expect(screen.getByLabelText(/identifiant du dossier/i)).toHaveValue('belize-2004');
  });

  test('a created task appears in the list', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText(/titre/i), 'Tikal');
    await user.click(screen.getByRole('button', { name: /^Créer/ }));
    expect(await screen.findByTestId('task-tikal')).toBeInTheDocument();
  });

  test('a taken slug is refused, and the refusal NAMES the existing task', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText(/titre/i), 'Autre chose');
    await user.clear(screen.getByLabelText(/identifiant du dossier/i));
    await user.type(screen.getByLabelText(/identifiant du dossier/i), '1999-transat');
    await user.click(screen.getByRole('button', { name: /^Créer/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/1999-transat/);
  });

  test('an empty title cannot be submitted', () => {
    setup();
    expect(screen.getByRole('button', { name: /^Créer/ })).toBeDisabled();
  });

  test('a title that slugifies to nothing cannot be submitted either', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText(/titre/i), '???');
    expect(screen.getByRole('button', { name: /^Créer/ })).toBeDisabled();
  });
});

describe('contract §4.5 — duplicating a task', () => {
  test('duplicating adds a new task to the list', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByTestId('task-1999-transat');
    await user.click(screen.getByRole('button', { name: /^Dupliquer/ }));
    await user.click(screen.getByRole('button', { name: /confirmer la duplication/i }));
    expect(await screen.findByTestId('task-1999-transat-copie')).toBeInTheDocument();
  });

  test('cancelling leaves the original untouched', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByTestId('task-1999-transat');
    await user.click(screen.getByRole('button', { name: /^Dupliquer/ }));
    await user.click(screen.getByRole('button', { name: /^Annuler/ }));
    expect(screen.queryByLabelText(/^Identifiant$/)).not.toBeInTheDocument();
  });
});

describe('contract §4.5 — deleting a task requires a second, explicit gesture', () => {
  test('a first click asks for confirmation, without deleting yet', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByTestId('task-1999-transat');
    await user.click(screen.getByRole('button', { name: /^Supprimer/ }));
    expect(screen.getByTestId('task-1999-transat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirmer la suppression/i })).toBeInTheDocument();
  });

  test('confirming removes the task, and never mentions a kept directory when there is none', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByTestId('task-1999-transat');
    await user.click(screen.getByRole('button', { name: /^Supprimer/ }));
    await user.click(screen.getByRole('button', { name: /confirmer la suppression/i }));

    const row = await screen.findByTestId('task-deleted-1999-transat');
    expect(row).toHaveTextContent(/supprimée/i);
    expect(row).not.toHaveTextContent(/conservé/i);
  });
});

describe('§5.1 — an unreachable TASKS_ROOT blocks creation but not consultation', () => {
  test('the banner is shown, creation is disabled, the list still reads', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByTestId('task-1999-transat');

    store.tasksRootAvailable = false;
    await user.type(screen.getByLabelText(/titre/i), 'Tikal');
    await user.click(screen.getByRole('button', { name: /^Créer/ }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/inaccessible/i);
    });
    // Consultation survives: never lose the list because writing is impossible.
    expect(screen.getByTestId('task-1999-transat')).toBeInTheDocument();
  });
});
