import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ImageNoteEditor } from './ImageNoteEditor';

describe('V1.6, Nicolas — a human comment on a selected image, today\'s register', () => {
  test('shows the current note, editable', () => {
    render(<ImageNoteEditor note="Hugo à la barre" onSave={() => {}} />);
    expect(screen.getByLabelText('Commentaire')).toHaveValue('Hugo à la barre');
  });

  test('no note yet starts empty, never a placeholder invented as a value', () => {
    render(<ImageNoteEditor note={null} onSave={() => {}} />);
    expect(screen.getByLabelText('Commentaire')).toHaveValue('');
  });

  test('saving sends the typed text', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<ImageNoteEditor note={null} onSave={onSave} />);
    await user.type(screen.getByLabelText('Commentaire'), 'On venait de doubler le Bugio');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(onSave).toHaveBeenCalledWith('On venait de doubler le Bugio');
  });

  test('clearing the field and saving sends null, not an empty string standing in for it', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<ImageNoteEditor note="Hugo à la barre" onSave={onSave} />);
    await user.clear(screen.getByLabelText('Commentaire'));
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  test('the save button is disabled until something actually changed', () => {
    render(<ImageNoteEditor note="Hugo à la barre" onSave={() => {}} />);
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
  });

  test('a note arriving from outside (a fresh photo) resets the draft', () => {
    const { rerender } = render(<ImageNoteEditor note="Hugo à la barre" onSave={() => {}} />);
    rerender(<ImageNoteEditor note="Un autre commentaire" onSave={() => {}} />);
    expect(screen.getByLabelText('Commentaire')).toHaveValue('Un autre commentaire');
  });
});
