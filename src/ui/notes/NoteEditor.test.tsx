import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NoteEditor } from './NoteEditor';

const noop = () => undefined;

describe('V1.7 — the shared note editor: prefilled, editable, Créer la note / Annuler', () => {
  test('the draft is prefilled with the source text, and editable', async () => {
    const user = userEvent.setup();
    render(<NoteEditor initialText="Mouillage devant Porlamar." onCreate={noop} onCancel={noop} />);
    const field = screen.getByRole('textbox');
    expect(field).toHaveValue('Mouillage devant Porlamar.');
    await user.type(field, ' Vent frais.');
    expect(field).toHaveValue('Mouillage devant Porlamar. Vent frais.');
  });

  test('« Créer la note » sends the CURRENT draft, retouched or not', async () => {
    const user = userEvent.setup();
    const created: string[] = [];
    render(
      <NoteEditor
        initialText="Texte d’origine."
        onCreate={(text) => { created.push(text); }}
        onCancel={noop}
      />,
    );
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'Texte retouché.');
    await user.click(screen.getByRole('button', { name: 'Créer la note' }));
    expect(created).toEqual(['Texte retouché.']);
  });

  test('an empty draft cannot be created — nothing to note', async () => {
    const user = userEvent.setup();
    render(<NoteEditor initialText="x" onCreate={noop} onCancel={noop} />);
    await user.clear(screen.getByRole('textbox'));
    expect(screen.getByRole('button', { name: 'Créer la note' })).toBeDisabled();
  });

  test('« Annuler » closes without creating anything', async () => {
    const user = userEvent.setup();
    const created: string[] = [];
    let cancelled = false;
    render(
      <NoteEditor
        initialText="x"
        onCreate={(text) => { created.push(text); }}
        onCancel={() => { cancelled = true; }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(created).toEqual([]);
    expect(cancelled).toBe(true);
  });
});
