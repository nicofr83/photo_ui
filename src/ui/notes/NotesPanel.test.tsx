import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { readDraft, writeDraft } from '../../domain/noteDraft';
import { renderWithProviders } from '../../test/renderWithProviders';

import { NotesPanel } from './NotesPanel';

const SLUG = '1999-transat';

beforeEach(() => { localStorage.clear(); });

const setup = () => renderWithProviders(<NotesPanel slug={SLUG} />);

describe('spec §5.5 — free notes, per task', () => {
  test('an empty task states there are none yet, not an empty silence', async () => {
    setup();
    expect(await screen.findByText(/aucune note/i)).toBeInTheDocument();
  });

  test('writing a general note adds it to the list', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText(/aucune note/i);

    await user.type(screen.getByLabelText(/titre/i), 'Rappel');
    await user.type(screen.getByLabelText(/texte/i), 'Vérifier la date du 12 décembre.');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(await screen.findByText('Rappel')).toBeInTheDocument();
    expect(await screen.findByText('Vérifier la date du 12 décembre.')).toBeInTheDocument();
  });

  test('an empty text cannot be saved', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText(/aucune note/i);
    await user.type(screen.getByLabelText(/titre/i), 'Rappel');
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
  });

  test('saving clears the form and the persisted draft', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText(/aucune note/i);

    await user.type(screen.getByLabelText(/titre/i), 'Rappel');
    await user.type(screen.getByLabelText(/texte/i), 'Un texte.');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => { expect(screen.getByLabelText(/titre/i)).toHaveValue(''); });
    expect(readDraft(SLUG)).toEqual({ title: '', text: '' });
  });

  test('a note can be removed', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText(/titre/i), 'À supprimer');
    await user.type(screen.getByLabelText(/texte/i), 'Contenu.');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));
    await screen.findByText('À supprimer');

    await user.click(screen.getByRole('button', { name: /supprimer/i }));
    await waitFor(() => {
      expect(screen.queryByText('À supprimer')).not.toBeInTheDocument();
    });
  });
});

describe('an in-progress note survives the client, spec §5.5', () => {
  test('a draft written before this render is restored into the form', async () => {
    writeDraft(SLUG, { title: 'Brouillon', text: 'pas encore enregistré' });
    setup();
    expect(await screen.findByLabelText(/titre/i)).toHaveValue('Brouillon');
    expect(screen.getByLabelText(/texte/i)).toHaveValue('pas encore enregistré');
  });

  test('typing persists the draft, and a fresh mount picks it up unprompted', async () => {
    const user = userEvent.setup();
    const { unmount } = setup();
    await screen.findByText(/aucune note/i);

    await user.type(screen.getByLabelText(/titre/i), 'Brouillon');
    await waitFor(() => { expect(readDraft(SLUG).title).toBe('Brouillon'); });
    unmount();

    renderWithProviders(<NotesPanel slug={SLUG} />);
    expect(await screen.findByLabelText(/titre/i)).toHaveValue('Brouillon');
  });
});
