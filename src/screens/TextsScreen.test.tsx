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

describe('§5.3 — three sources, three sections, never mixed', () => {
  test('each source has its own section', async () => {
    setup();
    expect(await screen.findByRole('region', { name: /journal de bord/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /ma vie/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /site web/i })).toBeInTheDocument();
  });

  test('a logbook text never appears under Ma vie', async () => {
    setup();
    const maVie = await screen.findByRole('region', { name: /ma vie/i });
    expect(within(maVie).queryByText(/Porlamar/)).not.toBeInTheDocument();
  });

  test('the web section states it has no page rather than showing an empty frame', async () => {
    setup();
    const web = await screen.findByRole('region', { name: /site web/i });
    expect(within(web).getByTestId('no-pages')).toHaveTextContent(/pas de page/i);
  });
});

describe('INVARIANT — a text that asserts no date says so, and never guesses', () => {
  test('a passage placed only by its page shows "indéterminée"', async () => {
    setup();
    const card = await screen.findByTestId('text-passage-logbook/p003/001');
    expect(within(card).getByTestId('text-date')).toHaveTextContent(/indéterminée/i);
  });

  test('a dated entry shows its day, marked as a reading', async () => {
    setup();
    const card = await screen.findByTestId('text-log_entry-logbook/p003/001');
    const date = within(card).getByTestId('resolved-date');
    expect(date).toHaveTextContent('1999-12-08');
    expect(date).toHaveAttribute('data-date-kind', 'reading');
  });

  test('the two texts sharing an id are two distinct cards', async () => {
    setup();
    expect(await screen.findByTestId('text-passage-logbook/p003/001')).toBeInTheDocument();
    expect(screen.getByTestId('text-log_entry-logbook/p003/001')).toBeInTheDocument();
  });
});

describe('INVARIANT — a carried page window is an inference and must show as one', () => {
  test('a carried window is named as reported from the previous page', async () => {
    setup();
    const card = await screen.findByTestId('text-passage-ma-vie/p007/002');
    expect(within(card).getByTestId('span-source')).toHaveTextContent(/reportée/i);
  });

  test('an entries-derived window is not called carried', async () => {
    setup();
    const card = await screen.findByTestId('text-log_entry-logbook/p003/001');
    expect(within(card).getByTestId('span-source')).not.toHaveTextContent(/reportée/i);
  });
});

describe('§5.3 — each passage carries its transcription confidence', () => {
  test('an uncertain transcription is flagged', async () => {
    setup();
    const card = await screen.findByTestId('text-passage-logbook/p003/001');
    expect(within(card).getByTestId('confidence')).toHaveTextContent(/incertaine/i);
  });
});

describe('§5.4 — a correction never destroys the transcription', () => {
  test('a corrected text shows the original underneath', async () => {
    setup();
    const card = await screen.findByTestId('text-log_entry-logbook/p003/001');
    expect(within(card).getByTestId('text-original')).toHaveTextContent('noeuds');
    expect(within(card).getByTestId('text-effective')).toHaveTextContent('nœuds');
  });

  test('a correction whose upstream text moved is flagged "à revoir", not applied silently', async () => {
    setup();
    const card = await screen.findByTestId('text-passage-ma-vie/p007/003');
    expect(within(card).getByTestId('correction-status')).toHaveTextContent(/à revoir/i);
  });
});

describe('the overlap count is reachable', () => {
  test('a passage says how many photos it covers, as a control', async () => {
    const user = userEvent.setup();
    const opened: string[] = [];
    renderWithProviders(
      <MemoryRouter initialEntries={['/textes/1999-transat']}>
        <Routes>
          <Route
            path="/textes/:slug"
            element={<TextsScreen onShowPhotos={(ref) => opened.push(`${ref.kind}:${ref.id}`)} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    const card = await screen.findByTestId('text-passage-logbook/p003/001');
    await user.click(within(card).getByRole('button', { name: /11 photos/ }));
    expect(opened).toEqual(['passage:logbook/p003/001']);
  });

  test('a passage covering nothing offers no button to press', async () => {
    setup();
    const card = await screen.findByTestId('text-passage-web/2003/2003_gal_1/001');
    expect(within(card).queryByRole('button', { name: /photos/ })).not.toBeInTheDocument();
  });
});

describe('T2 — correcting a transcription, the original always stays reachable', () => {
  test('correcting a passage replaces the effective text, and keeps the original beneath', async () => {
    const user = userEvent.setup();
    setup();
    const card = await screen.findByTestId('text-passage-logbook/p003/001');
    await user.click(within(card).getByRole('button', { name: /corriger/i }));

    const field = within(card).getByRole('textbox');
    await user.clear(field);
    await user.type(field, 'On a passé la nuit à réparer la pompe de cale, cassée.');
    await user.click(within(card).getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => {
      expect(within(card).getByTestId('text-effective')).toHaveTextContent(
        'On a passé la nuit à réparer la pompe de cale, cassée.',
      );
    });
    expect(within(card).getByTestId('text-original')).toHaveTextContent(
      'On a passé la nuit à réparer la pompe de cale.',
    );
  });

  test('an empty draft cannot be saved', async () => {
    const user = userEvent.setup();
    setup();
    const card = await screen.findByTestId('text-passage-logbook/p003/001');
    await user.click(within(card).getByRole('button', { name: /corriger/i }));
    await user.clear(within(card).getByRole('textbox'));
    expect(within(card).getByRole('button', { name: /enregistrer/i })).toBeDisabled();
  });

  test('a correction can be reverted, restoring the original as the effective text', async () => {
    const user = userEvent.setup();
    setup();
    const card = await screen.findByTestId('text-log_entry-logbook/p003/001');
    await user.click(within(card).getByRole('button', { name: /rétablir/i }));

    await waitFor(() => {
      expect(within(card).getByTestId('text-effective')).toHaveTextContent(
        'Mouillage devant Porlamar, vent d’est 15 noeuds.',
      );
    });
    expect(within(card).queryByTestId('text-original')).not.toBeInTheDocument();
  });
});

describe('contract §11 Q11 — gallery captions are a subsection of the web source', () => {
  test('the web section has a "Légendes de galerie" subsection', async () => {
    setup();
    const web = await screen.findByRole('region', { name: /site web/i });
    expect(within(web).getByRole('heading', { name: /légendes de galerie/i })).toBeInTheDocument();
  });

  test('a gallery caption renders as its own card, distinct from a passage', async () => {
    setup();
    const web = await screen.findByRole('region', { name: /site web/i });
    expect(
      await within(web).findByTestId('text-web_caption-web/2003/2003_gal_1/caption/000a86651c47'),
    ).toBeInTheDocument();
  });

  test('a gallery caption does NOT also appear in the flat per-document listing', async () => {
    setup();
    const web = await screen.findByRole('region', { name: /site web/i });
    await within(web).findByTestId('text-web_caption-web/2003/2003_gal_1/caption/000a86651c47');
    // Exactly one card for this ref, not duplicated by the per-document pass.
    expect(within(web).getAllByTestId('text-web_caption-web/2003/2003_gal_1/caption/000a86651c47'))
      .toHaveLength(1);
  });

  test('an unverified match is marked as a supposition, never confused with a certain one', async () => {
    setup();
    const card = await screen.findByTestId(
      'text-web_caption-web/2003/2003_gal_1/caption/000b44bd55d0',
    );
    expect(within(card).getByTestId('gallery-match')).toHaveTextContent(/non vérifiée/i);
  });

  test('a verified match is not flagged as a supposition', async () => {
    setup();
    const card = await screen.findByTestId(
      'text-web_caption-web/2003/2003_gal_1/caption/000a86651c47',
    );
    expect(within(card).queryByTestId('gallery-match')).not.toBeInTheDocument();
  });
});

describe('spec §5.4 — the scanned page is reachable in regard, and only when there is one', () => {
  test('a text with a page offers to show it, collapsed by default', async () => {
    setup();
    const card = await screen.findByTestId('text-log_entry-logbook/p003/001');
    expect(screen.queryByRole('img', { name: /p003/i })).not.toBeInTheDocument();
    await userEvent.setup().click(within(card).getByRole('button', { name: /voir la page/i }));
    expect(await screen.findByRole('img', { name: /p003/i })).toBeInTheDocument();
  });

  test('a web passage — no page scanned — offers no such button', async () => {
    setup();
    const card = await screen.findByTestId('text-passage-web/2003/2003_gal_1/001');
    expect(within(card).queryByRole('button', { name: /voir la page/i })).not.toBeInTheDocument();
  });
});
