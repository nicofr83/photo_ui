import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { store } from '../../../mocks/store';
import { readDraft, writeDraft } from '../../domain/noteDraft';
import type { TaskNote } from '../../api/contract/task';
import { parseIsoTimestamp } from '../../shared/date_interface';
import { renderWithProviders } from '../../test/renderWithProviders';

import { NotesPanel } from './NotesPanel';

const SLUG = '1999-transat';
const SOURCE_REF = { kind: 'passage', id: 'logbook/p003/001' } as const;
const SOURCE_TEXT = 'On a passé la nuit à réparer la pompe de cale.';

function seedNote(over: Partial<TaskNote> = {}): TaskNote {
  const note: TaskNote = {
    id: `note_${Math.random().toString(36).slice(2, 10)}`,
    title: 'journal de bord, page 3 du 09/07/1998',
    text: SOURCE_TEXT,
    createdAt: parseIsoTimestamp('2026-08-31T00:00:00.000Z'),
    updatedAt: parseIsoTimestamp('2026-08-31T00:00:00.000Z'),
    attachedTo: { images: [], texts: [] },
    derivedFrom: { ...SOURCE_REF, text: SOURCE_TEXT },
    // Placeholders — the mock recomputes both on every GET, same as
    // `materializeNote` does for the real thing.
    editedSince: false,
    quotable: false,
    ...over,
  };
  const task = store.tasks.get(SLUG);
  if (task === undefined) throw new Error('fixture task missing');
  task.notes.push(note);
  return note;
}

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

describe('V1.7, "comment se rendent les trois états"', () => {
  test('a note written from scratch carries no border, no mention, no provenance', async () => {
    const note = seedNote({ derivedFrom: null });
    setup();
    const item = await screen.findByTestId(`note-${note.id}`);
    expect(within(item).queryByTestId('note-provenance')).not.toBeInTheDocument();
  });

  test('a faithful excerpt is bordered solid, and names its source', async () => {
    // Same text as the real source's current one: quotable.
    const note = seedNote();
    setup();
    const item = await screen.findByTestId(`note-${note.id}`);
    expect(within(item).getByTestId('note-provenance')).toHaveAttribute('data-provenance', 'faithful');
    expect(item).toHaveTextContent(`extrait de ${note.title}`);
  });

  test('a rewritten note is bordered dashed, marked « reformulé », and can reveal the original', async () => {
    const user = userEvent.setup();
    const note = seedNote({ text: 'Un tout autre texte, jamais dans la page.' });
    setup();
    const item = await screen.findByTestId(`note-${note.id}`);
    expect(within(item).getByTestId('note-provenance')).toHaveAttribute('data-provenance', 'rewritten');
    expect(item).toHaveTextContent('reformulé');

    await user.click(within(item).getByRole('button', { name: /voir le texte d.origine/i }));
    expect(within(item).getByText(SOURCE_TEXT)).toBeInTheDocument();
  });

  test('a source corrected since stays faithful-bordered, with an added banner', async () => {
    const note = seedNote(); // text === snapshot === current source, for now.
    const source = store.texts.find((t) => t.ref.kind === SOURCE_REF.kind && t.ref.id === SOURCE_REF.id);
    if (source === undefined) throw new Error('fixture missing');
    // The source changes AFTER the note — the note itself is untouched.
    source.text = 'On a passé la nuit à réparer les deux pompes de cale.';

    setup();
    const item = await screen.findByTestId(`note-${note.id}`);
    expect(within(item).getByTestId('note-provenance')).toHaveAttribute('data-provenance', 'faithful');
    expect(item).toHaveTextContent('la source a été corrigée depuis');
  });

  // PROPOSED, pending back's sign-off: `PATCH .../notes/:id` gains
  // `resyncFromSource: true` — the server re-derives both the note's body
  // and its snapshot from the source's current text, since the client does
  // not (and must not) know what the correction now says.
  test('« Reprendre le texte corrigé » resyncs the note, and the banner clears', async () => {
    const user = userEvent.setup();
    const note = seedNote();
    const source = store.texts.find((t) => t.ref.kind === SOURCE_REF.kind && t.ref.id === SOURCE_REF.id);
    if (source === undefined) throw new Error('fixture missing');
    const corrected = 'On a passé la nuit à réparer les deux pompes de cale.';
    source.text = corrected;

    setup();
    const item = await screen.findByTestId(`note-${note.id}`);
    await user.click(within(item).getByRole('button', { name: /reprendre le texte corrigé/i }));

    await waitFor(() => { expect(item).toHaveTextContent(corrected); });
    expect(within(item).getByTestId('note-provenance')).toHaveAttribute('data-provenance', 'faithful');
    expect(item).not.toHaveTextContent('la source a été corrigée depuis');
  });
});
