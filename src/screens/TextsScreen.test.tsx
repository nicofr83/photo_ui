import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';

import { renderWithProviders } from '../test/renderWithProviders';

import { TextsScreen } from './TextsScreen';

const setup = (url = '/textes/1999-transat') =>
  renderWithProviders(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/textes/:slug" element={<TextsScreen />} />
      </Routes>
    </MemoryRouter>,
  );

/**
 * v1.5, Task 8: the per-document inline listing (three `region`-labelled
 * sections, one `TextCard` per text) is gone — replaced by the source picker
 * and the page list, covered in depth by `ui/texts/PageList.test.tsx`.
 *
 * V1.7: the filter column and the "Légendes de galerie" subsection are both
 * gone (spec, "en bref": filters disappear where they served nothing; the
 * web source no longer lists fragments, it reads real pages). What stays
 * here is screen-level wiring: the default source, the URL sync, and which
 * detail component each source opens into.
 */
describe('v1.5, Task 8 — one source at a time, the URL carries it', () => {
  test('the default source is the logbook, first in the picker', async () => {
    setup();
    const picker = await screen.findByRole('group', { name: 'Source' });
    expect(within(picker).getByRole('radio', { name: /journal de bord/i })).toBeChecked();
    expect(await screen.findByTestId('page-logbook/p003')).toBeInTheDocument();
  });

  test('picking a source writes it to the URL, and the list follows', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByTestId('page-logbook/p003');
    await user.click(screen.getByRole('radio', { name: /^ma vie$/i }));
    expect(await screen.findByTestId('page-ma-vie/p001')).toBeInTheDocument();
    expect(screen.queryByTestId('page-logbook/p003')).not.toBeInTheDocument();
  });
});

describe('V1.7 — the filter column is gone from all three sources', () => {
  test('the logbook offers no search or date filter', async () => {
    setup();
    await screen.findByTestId('page-logbook/p003');
    expect(screen.queryByLabelText(/rechercher un texte/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Du')).not.toBeInTheDocument();
  });

  test('the web source offers no filter either — five pages, none to narrow', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('radio', { name: /site web/i }));
    await screen.findByRole('button', { name: '1998-1999' });
    expect(screen.queryByLabelText(/rechercher/i)).not.toBeInTheDocument();
  });
});

describe('V1.7 — chaque source ouvre sur son propre écran de lecture', () => {
  test('the logbook opens a page onto the registre table, not the old card split', async () => {
    const user = userEvent.setup();
    setup();
    const page = await screen.findByTestId('page-logbook/p003');
    await user.click(within(page).getByRole('button'));
    expect(await screen.findByRole('columnheader', { name: 'Créer une note' })).toBeInTheDocument();
  });

  test('"Ma vie" opens a page onto one continuous reading zone', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('radio', { name: /^ma vie$/i }));
    const page = await screen.findByTestId('page-ma-vie/p003');
    await user.click(within(page).getByRole('button'));
    expect(await screen.findByTestId('ma-vie-text')).toBeInTheDocument();
  });

  test('the web source shows its five real pages, never the old document list', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('radio', { name: /site web/i }));
    expect(await screen.findByRole('button', { name: '1998-1999' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /légendes de galerie/i })).not.toBeInTheDocument();
  });
});
