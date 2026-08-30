import { screen, waitFor, within } from '@testing-library/react';
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
 * and the page list, covered in depth by `ui/texts/PageList.test.tsx`. What
 * stays here is screen-level wiring: the default source, the URL sync, and
 * gallery captions, which are not pages and live under the web source only.
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

describe('contract §11 Q11 — gallery captions live under the web source, never as pages', () => {
  test('the web source has a "Légendes de galerie" subsection', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('radio', { name: /site web/i }));
    expect(await screen.findByRole('heading', { name: /légendes de galerie/i })).toBeInTheDocument();
  });

  test('a gallery caption renders as its own card', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('radio', { name: /site web/i }));
    expect(
      await screen.findByTestId('text-web_caption-web/2003/2003_gal_1/caption/000a86651c47'),
    ).toBeInTheDocument();
  });

  test('a gallery caption is indicative only — no selection affordance', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('radio', { name: /site web/i }));
    const card = await screen.findByTestId(
      'text-web_caption-web/2003/2003_gal_1/caption/000a86651c47',
    );
    expect(within(card).queryByRole('button', { name: /retenir|retirer/i })).not.toBeInTheDocument();
  });

  test('an unverified match is marked as a supposition, never confused with a certain one', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('radio', { name: /site web/i }));
    const card = await screen.findByTestId(
      'text-web_caption-web/2003/2003_gal_1/caption/000b44bd55d0',
    );
    expect(within(card).getByTestId('gallery-match')).toHaveTextContent(/non vérifiée/i);
  });

  test('a verified match is not flagged as a supposition', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('radio', { name: /site web/i }));
    const card = await screen.findByTestId(
      'text-web_caption-web/2003/2003_gal_1/caption/000a86651c47',
    );
    expect(within(card).queryByTestId('gallery-match')).not.toBeInTheDocument();
  });
});

describe('the overlap count is reachable from a gallery caption', () => {
  test('clicking the photo count opens the grid pre-filtered on this text', async () => {
    const user = userEvent.setup();
    const opened: string[] = [];
    renderWithProviders(
      <MemoryRouter initialEntries={['/textes/1999-transat?source=web']}>
        <Routes>
          <Route
            path="/textes/:slug"
            element={<TextsScreen onShowPhotos={(ref) => opened.push(`${ref.kind}:${ref.id}`)} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    const card = await screen.findByTestId(
      'text-web_caption-web/2003/2003_gal_1/caption/000a86651c47',
    );
    await user.click(within(card).getByRole('button', { name: /1 images/ }));
    await waitFor(() => {
      expect(opened).toEqual(['web_caption:web/2003/2003_gal_1/caption/000a86651c47']);
    });
  });
});
